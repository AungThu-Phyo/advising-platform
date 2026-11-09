import { Hono } from "hono";
import { CampusInsightsClient, type CampusInsightsConfig } from "./integrations/campusInsights";
import { createWebhookSignature, verifyWebhookSignature } from "./utils/signature";
import { bookAppointment, createSlot } from "./services/booking";
import {
  AvailabilityError,
  generateLecturerSlots,
  upsertLecturerProfile,
  validateAvailabilityInput,
  validateOverrideInput,
} from "./services/lecturerAvailability";

type Bindings = CloudflareBindings & CampusInsightsConfig & {
  WEBHOOK_SECRET?: string;
  PARTNER_WEBHOOK_URL?: string;
  PARTNER_ACCESS_API_KEY?: string;
  DEFAULT_ADVISOR_EMAIL?: string;
};
type AuthUser = { id: string; email: string; name: string; role: "STUDENT" | "ADVISOR" | "ADMIN"; advisor_email?: string | null };
type StoredUser = AuthUser & { password_hash: string; password_salt: string; password_iterations: number };
type IncomingWebhookPayload = { eventId?: string; eventType?: string; id?: string; type?: string; [key: string]: unknown };
type SlotBookedPayload = { eventId: string; eventType: "slot_booked"; studentId: string; bookedSlot: { date: string; time: string }; lecturerEmail: string; serverTimestamp: string };

const app = new Hono<{ Bindings: Bindings; Variables: { user: AuthUser } }>();
const INBOUND_SIGNATURE_HEADER = "X-Webhook-Signature";
const CAMPUS_INSIGHTS_SIGNATURE_HEADER = "x-signature";
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const SESSION_COOKIE = "advising_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 100_000;
const ALLOWED_CORS_ORIGINS = new Set([
  "https://campus-insight-623f0.web.app",
  "http://localhost:5173",
]);
const DEMO_AVAILABILITY = [
  { date: "2026-11-10", time: "09:00-10:00" },
  { date: "2026-11-10", time: "10:00-11:00" },
  { date: "2026-11-12", time: "13:00-14:00" },
];

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function digest(value: string): Promise<string> {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function hashPassword(password: string, salt: Uint8Array, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return encodeBase64Url(new Uint8Array(bits));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function createSession(db: D1Database, userId: string): Promise<string> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = encodeBase64Url(tokenBytes);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, await digest(token), expiresAt).run();
  return token;
}

async function currentUser(c: { req: { raw: Request }; env: Bindings }): Promise<AuthUser | null> {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (!token) return null;
  const row = await c.env.advising_db.prepare(
    `SELECT users.id, users.email, users.name, users.role, users.advisor_email
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP`,
  ).bind(await digest(token)).first<AuthUser>();
  return row ?? null;
}

async function requireAuth(c: { req: { raw: Request }; env: Bindings; json: (body: unknown, status: 401) => Response }): Promise<AuthUser | Response> {
  const user = await currentUser(c);
  return user ?? c.json({ error: "Authentication required" }, 401);
}

function publicUser(user: AuthUser): AuthUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

async function logIntegrationEvent(db: D1Database, eventId: string, eventType: string, source: string, status: string, payload: string | null, response: string | null) {
  return db.prepare(`INSERT INTO integration_events (event_id, event_type, source, status, payload, response)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(eventId, eventType, source, status, payload, response).run();
}

async function parseJsonBody(c: any): Promise<{ body?: Record<string, unknown>; error?: Response }> {
  try { return { body: await c.req.json() as Record<string, unknown> }; }
  catch { return { error: c.json({ success: false, error: "Invalid JSON payload" }, 400) }; }
}

async function requirePartnerAccess(c: any): Promise<Response | null> {
  const configuredKey = c.env.PARTNER_ACCESS_API_KEY ?? c.env.ADVISING_PLATFORM_SECRET_KEY;
  const suppliedKey = c.req.header("x-api-key");
  if (!configuredKey || !suppliedKey) return c.json({ success: false, error: "Partner API key required" }, 401);
  const expected = new TextEncoder().encode(configuredKey);
  const supplied = new TextEncoder().encode(suppliedKey);
  const expectedDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", expected));
  const suppliedDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", supplied));
  if (!equalBytes(expectedDigest, suppliedDigest)) return c.json({ success: false, error: "Invalid partner API key" }, 401);
  return null;
}

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const allowedOrigin = origin && ALLOWED_CORS_ORIGINS.has(origin) ? origin : null;
  if (c.req.method === "OPTIONS") {
    if (!allowedOrigin) return c.json({ error: "Origin is not allowed" }, 403);
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }
  await next();
  const response = c.res;
  if (!allowedOrigin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  headers.set("Vary", "Origin");
  c.res = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return c.res;
});

app.get("/", async (c) => {
  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === "function") return c.env.ASSETS.fetch(c.req.raw);
  return c.json({ message: "Advising Platform — Campus Insights integration", endpoints: [
    "GET /api/health", "GET /api/campus-insights/lecturers/:email", "GET /api/campus-insights/lecturers/by-uid/:uid",
    "GET /api/partner/lecturers", "GET /api/partner/lecturers/:uid", "GET /api/partner/lecturers/:uid/availability",
    "GET /api/partner/availability?date=YYYY-MM-DD",
    "GET /api/partner/availability/weekly",
    "GET /api/campus-insights/availability/:lecturerId?date=YYYY-MM-DD",
    "GET /api/campus-insights/ratings/:lecturerId", "GET /api/campus-insights/topics?period=YYYY-MM",
    "GET /api/campus-insights/booking-stats?period=YYYY-MM", "POST /api/webhooks/partner",
    "POST /api/webhooks/send-test", "POST /api/integration/provider-test",
  ] });
});
app.get("/api/health", (c) => c.json({ status: "ok", service: "advising-platform-api" }));

app.post("/api/auth/register", async (c) => {
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidEmail(email) || !isNonEmptyString(name) || password.length < 8) {
    return c.json({ error: "A valid email, name, and password of at least 8 characters are required" }, 400);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const user: AuthUser = { id: crypto.randomUUID(), email, name, role: "STUDENT", advisor_email: c.env.DEFAULT_ADVISOR_EMAIL ?? null };
  try {
    await c.env.advising_db.prepare(
      `INSERT INTO users (id, email, name, role, advisor_email, password_hash, password_salt, password_iterations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(user.id, user.email, user.name, user.role, user.advisor_email, await hashPassword(password, salt), encodeBase64Url(salt), PASSWORD_ITERATIONS).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return c.json({ error: "An account with this email already exists" }, 409);
    throw error;
  }
  const token = await createSession(c.env.advising_db, user.id);
  return new Response(JSON.stringify({ user: publicUser(user) }), { status: 201, headers: { "content-type": "application/json", "Set-Cookie": sessionCookie(token) } });
});

app.post("/api/auth/login", async (c) => {
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const stored = await c.env.advising_db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<StoredUser>();
  if (!stored || !isValidEmail(email) || !isNonEmptyString(password)) return c.json({ error: "Invalid email or password" }, 401);
  const valid = equalBytes(decodeBase64Url(stored.password_hash), decodeBase64Url(await hashPassword(password, decodeBase64Url(stored.password_salt), stored.password_iterations)));
  if (!valid) return c.json({ error: "Invalid email or password" }, 401);
  const token = await createSession(c.env.advising_db, stored.id);
  return new Response(JSON.stringify({ user: publicUser(stored) }), { headers: { "content-type": "application/json", "Set-Cookie": sessionCookie(token) } });
});

app.get("/api/auth/me", async (c) => {
  const user = await requireAuth(c);
  return user instanceof Response ? user : c.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", async (c) => {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (token) await c.env.advising_db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await digest(token)).run();
  return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie("", 0) } });
});

app.get("/api/student/advisor", async (c) => {
  const user = await requireAuth(c); if (user instanceof Response) return user;
  if (user.role !== "STUDENT") return c.json({ error: "This endpoint is for students" }, 403);
  if (!user.advisor_email) return c.json({ error: "No advisor is assigned to this student" }, 503);
  return c.json({ advisorEmail: user.advisor_email, profile: (await client(c).getLecturerByEmail(user.advisor_email)).body });
});

app.get("/api/student/advisor/availability", async (c) => {
  const user = await requireAuth(c); if (user instanceof Response) return user;
  if (user.role !== "STUDENT") return c.json({ error: "This endpoint is for students" }, 403);
  if (!user.advisor_email) return c.json({ error: "No advisor is assigned to this student" }, 503);
  const date = c.req.query("date");
  if (!isNonEmptyString(date)) return c.json({ error: "date query parameter is required" }, 400);
  const advisor = await client(c).getLecturerByEmail(user.advisor_email);
  const partnerId = (advisor.body.data as { data?: { id?: string }; id?: string } | undefined)?.data?.id
    ?? (advisor.body.data as { id?: string } | undefined)?.id;
  const configured = c.env.CAMPUS_INSIGHTS_AVAILABILITY_URL && partnerId
    ? await client(c).getConfigured("availability", { lecturerId: partnerId, date })
    : null;
  if (configured?.status === 200) return c.json({ ...configured.body, fallback: false });
  return c.json({
    success: true,
    source: "local-demo",
    fallback: true,
    advisorEmail: user.advisor_email,
    date,
    slots: DEMO_AVAILABILITY.filter((slot) => slot.date === date),
  });
});

// Advising Request CRUD API. Requests are private to the authenticated student or staff.
app.post("/api/advising-requests", async (c) => {
  const user = await requireAuth(c); if (user instanceof Response) return user;
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const body = parsed.body as Record<string, string>;
  if (!isNonEmptyString(body.agenda) || !isNonEmptyString(body.preferred_date) || !isNonEmptyString(body.preferred_time)) return c.json({ error: "agenda, preferred_date, and preferred_time are required" }, 400);
  if (user.role === "STUDENT" && body.student_id && body.student_id !== user.id) return c.json({ error: "student_id must match the authenticated user" }, 403);
  const studentId = user.role === "STUDENT" ? user.id : body.student_id;
  if (!isNonEmptyString(studentId)) return c.json({ error: "student_id is required for staff-created requests" }, 400);
  const advisorEmail = user.role === "STUDENT" ? user.advisor_email : null;
  if (user.role === "STUDENT" && !advisorEmail) return c.json({ error: "No advisor is assigned to this student" }, 503);
  const result = await c.env.advising_db.prepare(`INSERT INTO advising_requests (student_id, advisor_email, agenda, preferred_date, preferred_time) VALUES (?, ?, ?, ?, ?) RETURNING *`).bind(studentId, advisorEmail, body.agenda, body.preferred_date, body.preferred_time).first();
  return c.json(result, 201);
});
app.get("/api/advising-requests", async (c) => {
  const user = await requireAuth(c); if (user instanceof Response) return user;
  const query = user.role === "STUDENT"
    ? "SELECT * FROM advising_requests WHERE student_id = ? ORDER BY id DESC"
    : "SELECT * FROM advising_requests ORDER BY id DESC";
  const advisorQuery = `SELECT advising_requests.*, users.name AS student_name, users.email AS student_email
         FROM advising_requests
         LEFT JOIN users ON users.id = advising_requests.student_id
         WHERE LOWER(COALESCE(advising_requests.advisor_email, users.advisor_email)) = LOWER(?)
         ORDER BY advising_requests.id DESC`
  const result = user.role === "STUDENT"
    ? await c.env.advising_db.prepare(query).bind(user.id).all()
    : user.role === "ADVISOR"
      ? await c.env.advising_db.prepare(advisorQuery).bind(user.email).all()
      : await c.env.advising_db.prepare(query).all();
  return c.json(result.results);
});
app.get("/api/advising-requests/:id", async (c) => {
  const user = await requireAuth(c); if (user instanceof Response) return user;
  const result = await c.env.advising_db.prepare("SELECT * FROM advising_requests WHERE id = ?").bind(c.req.param("id")).first<{ student_id: string }>();
  if (!result) return c.json({ error: "Advising request not found" }, 404);
  if (user.role === "STUDENT" && result.student_id !== user.id) return c.json({ error: "Forbidden" }, 403);
  return c.json(result);
});
app.patch("/api/advising-requests/:id", async (c) => {
  const user = await requireAuth(c); if (user instanceof Response) return user;
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const body = parsed.body as { agenda?: string; preferred_date?: string; preferred_time?: string; status?: string };
  if ([body.agenda, body.preferred_date, body.preferred_time, body.status].every((value) => value === undefined)) return c.json({ error: "At least one field is required to update" }, 400);
  const result = await c.env.advising_db.prepare(`UPDATE advising_requests SET agenda = COALESCE(?, agenda), preferred_date = COALESCE(?, preferred_date), preferred_time = COALESCE(?, preferred_time), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ? ${user.role === "STUDENT" ? "AND student_id = ?" : ""} RETURNING *`).bind(body.agenda ?? null, body.preferred_date ?? null, body.preferred_time ?? null, body.status ?? null, c.req.param("id"), ...(user.role === "STUDENT" ? [user.id] : [])).first();
  return result ? c.json(result) : c.json({ error: "Advising request not found" }, 404);
});
app.delete("/api/advising-requests/:id", async (c) => {
  const user = await requireAuth(c); if (user instanceof Response) return user;
  const result = await c.env.advising_db.prepare(`DELETE FROM advising_requests WHERE id = ? ${user.role === "STUDENT" ? "AND student_id = ?" : ""} RETURNING *`).bind(c.req.param("id"), ...(user.role === "STUDENT" ? [user.id] : [])).first();
  return result ? c.body(null, 204) : c.json({ error: "Advising request not found" }, 404);
});

app.patch("/api/advising-requests/:id/decision", async (c) => {
  const user = await requireAuth(c); if (user instanceof Response) return user;
  if (user.role !== "ADVISOR" && user.role !== "ADMIN") return c.json({ error: "Advisor access required" }, 403);
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const status = body.status;
  const decisionNote = typeof body.decision_note === "string" ? body.decision_note.trim() : "";
  if (status !== "approved" && status !== "rejected") return c.json({ error: "status must be approved or rejected" }, 400);
  if (!isNonEmptyString(decisionNote)) return c.json({ error: "decision_note is required" }, 400);
  const request = await c.env.advising_db.prepare(
    `SELECT id FROM advising_requests WHERE id = ? ${user.role === "ADVISOR" ? "AND advisor_email = ?" : ""}`,
  ).bind(c.req.param("id"), ...(user.role === "ADVISOR" ? [user.email] : [])).first();
  if (!request) return c.json({ error: "Advising request not found" }, 404);
  const result = await c.env.advising_db.prepare(
    "UPDATE advising_requests SET status = ?, decision_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *",
  ).bind(status, decisionNote, c.req.param("id")).first();
  return c.json(result);
});

// Campus Insights consumer endpoints. Only the lecturer endpoint has a confirmed partner URL.
const client = (c: { env: Bindings }) => new CampusInsightsClient(c.env);

function availabilityError(c: any, error: unknown): Response {
  if (error instanceof AvailabilityError) return c.json({ error: error.message }, error.status);
  throw error;
}

async function canManageLecturer(c: any, uid: string): Promise<boolean> {
  const user = await currentUser(c);
  if (!user || (user.role !== "ADMIN" && user.role !== "ADVISOR")) return false;
  if (user.role === "ADMIN") return true;
  const lecturer = await c.env.advising_db.prepare("SELECT email FROM lecturer_profiles WHERE uid = ?").bind(uid).first();
  return Boolean(lecturer?.email && lecturer.email.toLowerCase() === user.email.toLowerCase());
}

async function requireLecturerManager(c: any, uid: string): Promise<Response | null> {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  if (!(await canManageLecturer(c, uid))) return c.json({ error: "Lecturer or administrator access required" }, 403);
  return null;
}

app.get("/api/schools", async (c) => {
  const result = await c.env.advising_db.prepare(
    "SELECT school_id AS schoolId, school_name AS schoolName, COUNT(*) AS lecturerCount FROM lecturer_profiles GROUP BY school_id, school_name ORDER BY school_name",
  ).all();
  return c.json(result.results ?? []);
});

app.get("/api/schools/:schoolId/lecturers", async (c) => {
  const schoolId = c.req.param("schoolId");
  const department = c.req.query("department");
  const search = c.req.query("search");
  let query = "SELECT * FROM lecturer_profiles WHERE school_id = ?";
  const values: string[] = [schoolId];
  if (department) { query += " AND department = ?"; values.push(department); }
  if (search) { query += " AND (name LIKE ? OR email LIKE ?)"; values.push(`%${search}%`, `%${search}%`); }
  query += " ORDER BY name";
  const result = await c.env.advising_db.prepare(query).bind(...values).all();
  return c.json(result.results ?? []);
});

app.get("/api/lecturers/:uid", async (c) => {
  const lecturer = await c.env.advising_db.prepare("SELECT * FROM lecturer_profiles WHERE uid = ?").bind(c.req.param("uid")).first();
  return lecturer ? c.json(lecturer) : c.json({ error: "Lecturer not found" }, 404);
});

app.get("/api/lecturers/:uid/availability", async (c) => {
  const date = c.req.query("date");
  const durationMinutes = Number(c.req.query("durationMinutes") ?? 60);
  if (!date) return c.json({ error: "date is required" }, 400);
  try {
    const lecturer = await c.env.advising_db.prepare("SELECT * FROM lecturer_profiles WHERE uid = ?").bind(c.req.param("uid")).first();
    if (!lecturer) return c.json({ error: "Lecturer not found" }, 404);
    return c.json({ lecturer, slots: await generateLecturerSlots(c.env.advising_db, c.req.param("uid"), date, durationMinutes) });
  } catch (error) { return availabilityError(c, error); }
});

app.get("/api/availability", async (c) => {
  const date = c.req.query("date");
  if (!date) return c.json({ error: "date is required" }, 400);
  const schoolId = c.req.query("schoolId");
  const lecturerId = c.req.query("lecturerId");
  const department = c.req.query("department");
  let query = "SELECT * FROM lecturer_profiles WHERE 1 = 1";
  const values: string[] = [];
  if (schoolId) { query += " AND school_id = ?"; values.push(schoolId); }
  if (lecturerId) { query += " AND uid = ?"; values.push(lecturerId); }
  if (department) { query += " AND department = ?"; values.push(department); }
  const lecturers = (await c.env.advising_db.prepare(query).bind(...values).all<{ uid: string; school_id: string; school_name: string; name: string | null; email: string | null }>()).results ?? [];
  try {
    const results = [];
    for (const lecturer of lecturers) results.push({ lecturer, slots: await generateLecturerSlots(c.env.advising_db, lecturer.uid, date, Number(c.req.query("durationMinutes") ?? 60)) });
    return c.json(results);
  } catch (error) { return availabilityError(c, error); }
});

app.get("/api/partner/lecturers", async (c) => {
  const denied = await requirePartnerAccess(c); if (denied) return denied;
  const schoolId = c.req.query("schoolId");
  const department = c.req.query("department");
  let query = "SELECT uid, name, email, department, office, title, school_id, school_name, partner_updated_at FROM lecturer_profiles WHERE 1 = 1";
  const values: string[] = [];
  if (schoolId) { query += " AND school_id = ?"; values.push(schoolId); }
  if (department) { query += " AND department = ?"; values.push(department); }
  query += " ORDER BY school_name, name";
  const result = await c.env.advising_db.prepare(query).bind(...values).all();
  return c.json({ success: true, data: result.results ?? [] });
});

app.get("/api/partner/lecturers/:uid", async (c) => {
  const denied = await requirePartnerAccess(c); if (denied) return denied;
  const lecturer = await c.env.advising_db.prepare(
    "SELECT uid, name, email, department, office, title, school_id, school_name, partner_updated_at FROM lecturer_profiles WHERE uid = ?",
  ).bind(c.req.param("uid")).first();
  return lecturer ? c.json({ success: true, data: lecturer }) : c.json({ success: false, error: "Lecturer not found" }, 404);
});

app.get("/api/partner/lecturers/:uid/availability", async (c) => {
  const denied = await requirePartnerAccess(c); if (denied) return denied;
  const date = c.req.query("date");
  const durationMinutes = Number(c.req.query("durationMinutes") ?? 60);
  if (!date) return c.json({ success: false, error: "date is required" }, 400);
  try {
    const lecturer = await c.env.advising_db.prepare(
      "SELECT uid, name, email, department, office, title, school_id, school_name FROM lecturer_profiles WHERE uid = ?",
    ).bind(c.req.param("uid")).first();
    if (!lecturer) return c.json({ success: false, error: "Lecturer not found" }, 404);
    return c.json({ success: true, data: { lecturer, slots: await generateLecturerSlots(c.env.advising_db, c.req.param("uid"), date, durationMinutes, new Date(), true) } });
  } catch (error) { return availabilityError(c, error); }
});

app.get("/api/partner/availability", async (c) => {
  const denied = await requirePartnerAccess(c); if (denied) return denied;
  const date = c.req.query("date");
  const durationMinutes = Number(c.req.query("durationMinutes") ?? 60);
  if (!date) return c.json({ success: false, error: "date is required" }, 400);
  try {
    const lecturers = (await c.env.advising_db.prepare(
      "SELECT uid, name, email, department, office, title, school_id, school_name FROM lecturer_profiles ORDER BY school_name, name",
    ).all()).results ?? [];
    const data = [];
    for (const lecturer of lecturers) {
      data.push({
        lecturer,
        slots: await generateLecturerSlots(c.env.advising_db, String(lecturer.uid), date, durationMinutes, new Date(), true),
      });
    }
    return c.json({ success: true, date, durationMinutes, data });
  } catch (error) { return availabilityError(c, error); }
});

app.get("/api/partner/availability/weekly", async (c) => {
  const denied = await requirePartnerAccess(c); if (denied) return denied;
  const schoolId = c.req.query("schoolId");
  const query = `
    SELECT
      p.uid, p.name, p.email, p.department, p.office, p.title,
      p.school_id, p.school_name,
      a.day_of_week, a.start_time, a.end_time, a.timezone
    FROM lecturer_profiles p
    LEFT JOIN lecturer_weekly_availability a ON a.lecturer_uid = p.uid
    ${schoolId ? "WHERE p.school_id = ?" : ""}
    ORDER BY p.school_name, p.name, a.day_of_week, a.start_time
  `;
  const result = await c.env.advising_db.prepare(query).bind(...(schoolId ? [schoolId] : [])).all();
  const grouped = new Map<string, { lecturer: Record<string, unknown>; weeklyAvailability: Record<string, unknown>[] }>();
  for (const row of result.results ?? []) {
    const uid = String(row.uid);
    let entry = grouped.get(uid);
    if (!entry) {
      const { day_of_week, start_time, end_time, timezone, ...lecturer } = row;
      entry = { lecturer, weeklyAvailability: [] };
      grouped.set(uid, entry);
      if (day_of_week == null) continue;
    }
    if (row.day_of_week != null) {
      entry.weeklyAvailability.push({
        dayOfWeek: row.day_of_week,
        startTime: row.start_time,
        endTime: row.end_time,
        timezone: row.timezone,
      });
    }
  }
  return c.json({ success: true, data: Array.from(grouped.values()) });
});

app.post("/api/lecturers/:uid/availability/weekly", async (c) => {
  const denied = await requireLecturerManager(c, c.req.param("uid")); if (denied) return denied;
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  try {
    const input = validateAvailabilityInput(parsed.body as any);
    const profile = await c.env.advising_db.prepare("SELECT school_id FROM lecturer_profiles WHERE uid = ?").bind(c.req.param("uid")).first<{ school_id: string }>();
    if (!profile) return c.json({ error: "Lecturer not found" }, 404);
    if (profile.school_id !== input.schoolId) return c.json({ error: "schoolId does not match lecturer profile" }, 409);
    const result = await c.env.advising_db.prepare(
      "INSERT INTO lecturer_weekly_availability (lecturer_uid, school_id, day_of_week, start_time, end_time, timezone) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
    ).bind(c.req.param("uid"), input.schoolId, input.dayOfWeek, input.startTime, input.endTime, input.timezone).first();
    return c.json(result, 201);
  } catch (error) { return availabilityError(c, error); }
});

app.patch("/api/lecturers/:uid/availability/weekly/:id", async (c) => {
  const denied = await requireLecturerManager(c, c.req.param("uid")); if (denied) return denied;
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  try {
    const input = validateAvailabilityInput(parsed.body as any);
    const result = await c.env.advising_db.prepare(
      "UPDATE lecturer_weekly_availability SET school_id = ?, day_of_week = ?, start_time = ?, end_time = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lecturer_uid = ? RETURNING *",
    ).bind(input.schoolId, input.dayOfWeek, input.startTime, input.endTime, input.timezone, c.req.param("id"), c.req.param("uid")).first();
    return result ? c.json(result) : c.json({ error: "Availability not found" }, 404);
  } catch (error) { return availabilityError(c, error); }
});

app.delete("/api/lecturers/:uid/availability/weekly/:id", async (c) => {
  const denied = await requireLecturerManager(c, c.req.param("uid")); if (denied) return denied;
  const result = await c.env.advising_db.prepare("DELETE FROM lecturer_weekly_availability WHERE id = ? AND lecturer_uid = ?").bind(c.req.param("id"), c.req.param("uid")).run();
  return result.meta.changes === 1 ? c.body(null, 204) : c.json({ error: "Availability not found" }, 404);
});

app.put("/api/lecturers/:uid/availability/overrides/:date", async (c) => {
  const denied = await requireLecturerManager(c, c.req.param("uid")); if (denied) return denied;
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  try {
    const input = validateOverrideInput({ ...(parsed.body as any), date: c.req.param("date") });
    const profile = await c.env.advising_db.prepare("SELECT school_id FROM lecturer_profiles WHERE uid = ?").bind(c.req.param("uid")).first<{ school_id: string }>();
    if (!profile) return c.json({ error: "Lecturer not found" }, 404);
    if (profile.school_id !== input.schoolId) return c.json({ error: "schoolId does not match lecturer profile" }, 409);
    const result = await c.env.advising_db.prepare(`
      INSERT INTO lecturer_availability_overrides (lecturer_uid, school_id, availability_date, is_available, start_time, end_time, timezone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lecturer_uid, availability_date) DO UPDATE SET
        school_id = excluded.school_id, is_available = excluded.is_available,
        start_time = excluded.start_time, end_time = excluded.end_time,
        timezone = excluded.timezone, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `).bind(c.req.param("uid"), input.schoolId, input.date, input.isAvailable ? 1 : 0, input.startTime ?? null, input.endTime ?? null, input.timezone).first();
    return c.json(result);
  } catch (error) { return availabilityError(c, error); }
});

app.delete("/api/lecturers/:uid/availability/overrides/:date", async (c) => {
  const denied = await requireLecturerManager(c, c.req.param("uid")); if (denied) return denied;
  const result = await c.env.advising_db.prepare("DELETE FROM lecturer_availability_overrides WHERE lecturer_uid = ? AND availability_date = ?").bind(c.req.param("uid"), c.req.param("date")).run();
  return result.meta.changes === 1 ? c.body(null, 204) : c.json({ error: "Availability override not found" }, 404);
});

app.post("/api/lecturers/:uid/sync", async (c) => {
  const user = await currentUser(c);
  if (!user || user.role !== "ADMIN") return c.json({ error: "Administrator access required" }, 403);
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  try {
    const record = parsed.body as Record<string, unknown>;
    if (record.uid !== c.req.param("uid")) return c.json({ error: "uid must match the route parameter" }, 400);
    return c.json(await upsertLecturerProfile(c.env.advising_db, record), 200);
  }
  catch (error) { return availabilityError(c, error); }
});

app.post("/api/lecturers/:uid/appointments", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  if (user.role !== "STUDENT") return c.json({ error: "Student access required" }, 403);
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const body = parsed.body as any;
  try {
    const lecturer = await c.env.advising_db.prepare("SELECT * FROM lecturer_profiles WHERE uid = ?").bind(c.req.param("uid")).first<{ uid: string; email: string | null; school_id: string }>();
    if (!lecturer) return c.json({ error: "Lecturer not found" }, 404);
    if (body.schoolId !== lecturer.school_id) return c.json({ error: "schoolId does not match lecturer profile" }, 409);
    const starts = typeof body.startTime === "string" ? body.startTime : "";
    const ends = typeof body.endTime === "string" ? body.endTime : "";
    const startMinutes = Number(starts.slice(0, 2)) * 60 + Number(starts.slice(3));
    const endMinutes = Number(ends.slice(0, 2)) * 60 + Number(ends.slice(3));
    const generated = await generateLecturerSlots(c.env.advising_db, lecturer.uid, body.date, endMinutes - startMinutes);
    const selected = generated.find((slot) => slot.startTime === starts && slot.endTime === ends);
    if (!selected) return c.json({ error: "Selected time is not currently available" }, 409);
    const advisor = lecturer.email ? await c.env.advising_db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND role IN ('ADVISOR', 'advisor') AND is_active = 1").bind(lecturer.email).first<{ id: string }>() : null;
    if (!advisor) return c.json({ error: "Lecturer is not linked to an active advisor account" }, 409);
    const slot = await createSlot(c.env.advising_db, { advisorId: advisor.id, startsAt: selected.startsAt, endsAt: selected.endsAt });
    return c.json(await bookAppointment(c.env.advising_db, { slotId: slot.id, studentId: user.id, agendaRaw: typeof body.agenda === "string" ? body.agenda : "" }), 201);
  } catch (error) { return availabilityError(c, error); }
});

app.get("/api/campus-insights/lecturers/by-uid/:uid", async (c) => {
  const uid = c.req.param("uid");
  if (!isNonEmptyString(uid)) return c.json({ success: false, error: "Lecturer UID is required" }, 400);
  const result = await client(c).getLecturerByUid(uid);
  return c.json(result.body, result.status as 200 | 429 | 502 | 503 | 504);
});
app.get("/api/campus-insights/lecturers/:email", async (c) => { const email = c.req.param("email"); if (!isValidEmail(email)) return c.json({ success: false, error: "A valid lecturer email is required" }, 400); const result = await client(c).getLecturerByEmail(email); return c.json(result.body, result.status as 200 | 429 | 502 | 503 | 504); });
app.get("/api/campus-insights/availability/:lecturerId", async (c) => { const lecturerId = c.req.param("lecturerId"); const date = c.req.query("date"); if (!isNonEmptyString(lecturerId) || !isNonEmptyString(date)) return c.json({ success: false, error: "lecturerId and date query parameter are required" }, 400); const result = await client(c).getConfigured("availability", { lecturerId, date }); return c.json(result.body, result.status as 200 | 429 | 502 | 503 | 504); });
app.get("/api/campus-insights/ratings/:lecturerId", async (c) => { const lecturerId = c.req.param("lecturerId"); if (!isNonEmptyString(lecturerId)) return c.json({ success: false, error: "lecturerId is required" }, 400); const result = await client(c).getConfigured("ratings", { lecturerId }); return c.json(result.body, result.status as 200 | 429 | 502 | 503 | 504); });
app.get("/api/campus-insights/topics", async (c) => { const period = c.req.query("period"); if (!isNonEmptyString(period)) return c.json({ success: false, error: "period query parameter is required" }, 400); const result = await client(c).getConfigured("topics", { period }); return c.json(result.body, result.status as 200 | 429 | 502 | 503 | 504); });
app.get("/api/campus-insights/booking-stats", async (c) => { const period = c.req.query("period"); if (!isNonEmptyString(period)) return c.json({ success: false, error: "period query parameter is required" }, 400); const result = await client(c).getConfigured("booking statistics", { period }); return c.json(result.body, result.status as 200 | 429 | 502 | 503 | 504); });

async function receiveWebhook(c: any, source: string) {
  const secret = c.env.WEBHOOK_SECRET;
  if (!secret) return c.json({ success: false, error: "Webhook secret is not configured" }, 500);
  const rawBody = await c.req.text(); const signature = c.req.header(INBOUND_SIGNATURE_HEADER);
  if (rawBody.length > 1_000_000) return c.json({ success: false, error: "Webhook payload is too large" }, 413);
  if (!signature) return c.json({ success: false, error: `${INBOUND_SIGNATURE_HEADER} header required` }, 401);
  if (!(await verifyWebhookSignature(rawBody, signature, secret))) return c.json({ success: false, error: "Invalid webhook signature" }, 401);
  let parsedPayload: unknown; try { parsedPayload = JSON.parse(rawBody); } catch { return c.json({ success: false, error: "Invalid JSON payload" }, 400); }
  if (!isRecord(parsedPayload)) return c.json({ success: false, error: "Webhook payload must be a JSON object" }, 400);
  const payload = parsedPayload as IncomingWebhookPayload;
  const eventId = payload.eventId ?? payload.id; const eventType = payload.eventType ?? payload.type;
  if (!isNonEmptyString(eventId) || !isNonEmptyString(eventType)) return c.json({ success: false, error: "Webhook payload requires eventId and eventType" }, 400);
  try { await logIntegrationEvent(c.env.advising_db, eventId, eventType, source, "received", rawBody, JSON.stringify({ success: true, signatureVerified: true, eventId })); }
  catch (error) { if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return c.json({ success: true, duplicate: true, eventId, message: "Webhook event already processed" }); throw error; }
  return c.json({ success: true, duplicate: false, signatureVerified: true, eventId, message: "Webhook accepted" });
}
// A browser uses GET. Keep the webhook endpoint discoverable without accepting
// unauthenticated events; only POST below processes webhook deliveries.
app.get("/api/webhooks/partner", (c) => c.json({
  status: "active",
  message: "Webhook receiver is active. Send an authenticated POST request to this URL.",
  method: "POST",
  signatureHeader: INBOUND_SIGNATURE_HEADER,
}, 200));
app.post("/api/webhooks/partner", async (c) => receiveWebhook(c, "campus-insights"));
app.post("/api/integration/provider-test", async (c) => receiveWebhook(c, "provider-test"));

app.post("/api/webhooks/send-test", async (c) => {
  const partnerUrl = c.env.PARTNER_WEBHOOK_URL;

  // Team 24 confirmed that this one shared key is used for both their API and webhook calls.
  const partnerSignature = c.env.CAMPUS_INSIGHTS_API_KEY;
  if (c.env.CAMPUS_INSIGHTS_ENABLED !== "true") return c.json({ success: false, source: "campus-insights", fallback: true, error: "Campus Insights integration is disabled until the partner contract is configured" }, 503);
  if (!partnerUrl || !partnerSignature) return c.json({ success: false, source: "campus-insights", fallback: true, error: !partnerUrl ? "Partner webhook URL is not configured" : "Campus Insights API key is not configured" }, 503);
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const input = parsed.body as { eventId?: string; studentId?: string; lecturerEmail?: string; bookedSlot?: { date?: string; time?: string } };
  const studentId = input.studentId; const lecturerEmail = input.lecturerEmail; const date = input.bookedSlot?.date; const time = input.bookedSlot?.time;
  if (!isNonEmptyString(studentId) || !isNonEmptyString(lecturerEmail) || !isValidEmail(lecturerEmail) || !isNonEmptyString(date) || !isNonEmptyString(time)) return c.json({ success: false, error: "studentId, lecturerEmail, bookedSlot.date, and bookedSlot.time are required" }, 400);
  const eventId = isNonEmptyString(input.eventId) ? input.eventId : `slot-booked-${crypto.randomUUID()}`;
  if (isNonEmptyString(input.eventId)) {
    const existing = await c.env.advising_db.prepare("SELECT event_id, status FROM integration_events WHERE event_id = ?").bind(eventId).first<{ event_id: string; status: string }>();
    if (existing) return c.json({ success: true, duplicate: true, eventId, status: existing.status, message: "Integration event already processed" });
  }
  const payload: SlotBookedPayload = { eventId, eventType: "slot_booked", studentId, lecturerEmail, bookedSlot: { date, time }, serverTimestamp: new Date().toISOString() };
  const body = JSON.stringify(payload); const requestedAt = new Date().toISOString();
  try {
    const response = await fetch(partnerUrl, { method: "POST", headers: { "Content-Type": "application/json", [CAMPUS_INSIGHTS_SIGNATURE_HEADER]: partnerSignature }, body, signal: AbortSignal.timeout(8_000) }); await response.body?.cancel();
    await logIntegrationEvent(c.env.advising_db, payload.eventId, payload.eventType, "advising-platform-sender", response.ok ? "sent" : "failed", body, JSON.stringify({ requestedAt, partnerStatus: response.status }));
    return c.json({ success: response.ok, eventId: payload.eventId, requestedAt, partnerStatus: response.status, fallback: !response.ok, recovery: response.ok ? undefined : "Retry manually after the partner has recovered." }, response.ok ? 200 : 502);
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "Partner request timed out" : "Partner webhook request failed";
    await logIntegrationEvent(c.env.advising_db, payload.eventId, payload.eventType, "advising-platform-sender", "failed", body, JSON.stringify({ requestedAt, error: reason }));
    return c.json({ success: false, eventId: payload.eventId, requestedAt, source: "campus-insights", fallback: true, error: reason, recovery: "Retry manually after the partner has recovered." }, 502);
  }
});

app.all("*", async (c) => {
  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === "function") return c.env.ASSETS.fetch(c.req.raw);
  return c.notFound();
});

export default app;

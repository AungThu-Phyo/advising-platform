import { Hono } from "hono";
import { CampusInsightsClient, type CampusInsightsConfig } from "./integrations/campusInsights";
import { createWebhookSignature, verifyWebhookSignature } from "./utils/signature";

type Bindings = CloudflareBindings & CampusInsightsConfig & {
  WEBHOOK_SECRET?: string;
  PARTNER_WEBHOOK_URL?: string;
};
type IncomingWebhookPayload = { eventId?: string; eventType?: string; id?: string; type?: string; [key: string]: unknown };
type SlotBookedPayload = { eventId: string; eventType: "slot_booked"; studentId: string; bookedSlot: { date: string; time: string }; lecturerEmail: string; serverTimestamp: string };

const app = new Hono<{ Bindings: Bindings }>();
const INBOUND_SIGNATURE_HEADER = "X-Webhook-Signature";
const CAMPUS_INSIGHTS_SIGNATURE_HEADER = "x-signature";
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function logIntegrationEvent(db: D1Database, eventId: string, eventType: string, source: string, status: string, payload: string | null, response: string | null) {
  return db.prepare(`INSERT INTO integration_events (event_id, event_type, source, status, payload, response)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(eventId, eventType, source, status, payload, response).run();
}

async function parseJsonBody(c: any): Promise<{ body?: Record<string, unknown>; error?: Response }> {
  try { return { body: await c.req.json() as Record<string, unknown> }; }
  catch { return { error: c.json({ success: false, error: "Invalid JSON payload" }, 400) }; }
}

app.get("/", (c) => c.json({ message: "Advising Platform — Campus Insights integration", endpoints: [
  "GET /api/health", "GET /api/campus-insights/lecturers/:email",
  "GET /api/campus-insights/availability/:lecturerId?date=YYYY-MM-DD",
  "GET /api/campus-insights/ratings/:lecturerId", "GET /api/campus-insights/topics?period=YYYY-MM",
  "GET /api/campus-insights/booking-stats?period=YYYY-MM", "POST /api/webhooks/partner",
  "POST /api/webhooks/send-test", "POST /api/integration/provider-test",
] }));
app.get("/api/health", (c) => c.json({ status: "ok", service: "advising-platform-api" }));

// Existing Advising Request CRUD API
app.post("/api/advising-requests", async (c) => {
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const body = parsed.body as Record<string, string>;
  if (!isNonEmptyString(body.student_id) || !isNonEmptyString(body.agenda) || !isNonEmptyString(body.preferred_date) || !isNonEmptyString(body.preferred_time)) return c.json({ error: "student_id, agenda, preferred_date, and preferred_time are required" }, 400);
  const result = await c.env.advising_db.prepare(`INSERT INTO advising_requests (student_id, agenda, preferred_date, preferred_time) VALUES (?, ?, ?, ?) RETURNING *`).bind(body.student_id, body.agenda, body.preferred_date, body.preferred_time).first();
  return c.json(result, 201);
});
app.get("/api/advising-requests", async (c) => c.json((await c.env.advising_db.prepare("SELECT * FROM advising_requests ORDER BY id DESC").all()).results));
app.get("/api/advising-requests/:id", async (c) => { const result = await c.env.advising_db.prepare("SELECT * FROM advising_requests WHERE id = ?").bind(c.req.param("id")).first(); return result ? c.json(result) : c.json({ error: "Advising request not found" }, 404); });
app.patch("/api/advising-requests/:id", async (c) => {
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const body = parsed.body as { agenda?: string; preferred_date?: string; preferred_time?: string; status?: string };
  if ([body.agenda, body.preferred_date, body.preferred_time, body.status].every((value) => value === undefined)) return c.json({ error: "At least one field is required to update" }, 400);
  const result = await c.env.advising_db.prepare(`UPDATE advising_requests SET agenda = COALESCE(?, agenda), preferred_date = COALESCE(?, preferred_date), preferred_time = COALESCE(?, preferred_time), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`).bind(body.agenda ?? null, body.preferred_date ?? null, body.preferred_time ?? null, body.status ?? null, c.req.param("id")).first();
  return result ? c.json(result) : c.json({ error: "Advising request not found" }, 404);
});
app.delete("/api/advising-requests/:id", async (c) => { const result = await c.env.advising_db.prepare("DELETE FROM advising_requests WHERE id = ? RETURNING *").bind(c.req.param("id")).first(); return result ? c.body(null, 204) : c.json({ error: "Advising request not found" }, 404); });

// Campus Insights consumer endpoints. Only the lecturer endpoint has a confirmed partner URL.
const client = (c: { env: Bindings }) => new CampusInsightsClient(c.env);
app.get("/api/campus-insights/lecturers/:email", async (c) => { const email = c.req.param("email"); if (!isValidEmail(email)) return c.json({ success: false, error: "A valid lecturer email is required" }, 400); const result = await client(c).getLecturerByEmail(email); return c.json(result.body, result.status as 200 | 502 | 503 | 504); });
app.get("/api/campus-insights/availability/:lecturerId", async (c) => { const lecturerId = c.req.param("lecturerId"); const date = c.req.query("date"); if (!isNonEmptyString(lecturerId) || !isNonEmptyString(date)) return c.json({ success: false, error: "lecturerId and date query parameter are required" }, 400); const result = await client(c).getConfigured("availability", { lecturerId, date }); return c.json(result.body, result.status as 200 | 502 | 503 | 504); });
app.get("/api/campus-insights/ratings/:lecturerId", async (c) => { const lecturerId = c.req.param("lecturerId"); if (!isNonEmptyString(lecturerId)) return c.json({ success: false, error: "lecturerId is required" }, 400); const result = await client(c).getConfigured("ratings", { lecturerId }); return c.json(result.body, result.status as 200 | 502 | 503 | 504); });
app.get("/api/campus-insights/topics", async (c) => { const period = c.req.query("period"); if (!isNonEmptyString(period)) return c.json({ success: false, error: "period query parameter is required" }, 400); const result = await client(c).getConfigured("topics", { period }); return c.json(result.body, result.status as 200 | 502 | 503 | 504); });
app.get("/api/campus-insights/booking-stats", async (c) => { const period = c.req.query("period"); if (!isNonEmptyString(period)) return c.json({ success: false, error: "period query parameter is required" }, 400); const result = await client(c).getConfigured("booking statistics", { period }); return c.json(result.body, result.status as 200 | 502 | 503 | 504); });

async function receiveWebhook(c: any, source: string) {
  const secret = c.env.WEBHOOK_SECRET;
  if (!secret) return c.json({ success: false, error: "Webhook secret is not configured" }, 500);
  const rawBody = await c.req.text(); const signature = c.req.header(INBOUND_SIGNATURE_HEADER);
  if (!signature) return c.json({ success: false, error: `${INBOUND_SIGNATURE_HEADER} header required` }, 401);
  if (!(await verifyWebhookSignature(rawBody, signature, secret))) return c.json({ success: false, error: "Invalid webhook signature" }, 401);
  let payload: IncomingWebhookPayload; try { payload = JSON.parse(rawBody) as IncomingWebhookPayload; } catch { return c.json({ success: false, error: "Invalid JSON payload" }, 400); }
  const eventId = payload.eventId ?? payload.id; const eventType = payload.eventType ?? payload.type;
  if (!isNonEmptyString(eventId) || !isNonEmptyString(eventType)) return c.json({ success: false, error: "Webhook payload requires eventId and eventType" }, 400);
  try { await logIntegrationEvent(c.env.advising_db, eventId, eventType, source, "received", rawBody, JSON.stringify({ success: true, signatureVerified: true, eventId })); }
  catch (error) { if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return c.json({ success: true, duplicate: true, eventId, message: "Webhook event already processed" }); throw error; }
  return c.json({ success: true, duplicate: false, signatureVerified: true, eventId, message: "Webhook accepted" });
}
app.post("/api/webhooks/partner", async (c) => receiveWebhook(c, "campus-insights"));
app.post("/api/integration/provider-test", async (c) => receiveWebhook(c, "provider-test"));

app.post("/api/webhooks/send-test", async (c) => {
  const partnerUrl = c.env.PARTNER_WEBHOOK_URL;
  // Team 24 confirmed that this one shared key is used for both their API and webhook calls.
  const partnerSignature = c.env.CAMPUS_INSIGHTS_API_KEY;
  if (!partnerUrl || !partnerSignature) return c.json({ success: false, source: "campus-insights", fallback: true, error: !partnerUrl ? "Partner webhook URL is not configured" : "Campus Insights API key is not configured" }, 503);
  const parsed = await parseJsonBody(c); if (parsed.error) return parsed.error;
  const input = parsed.body as { studentId?: string; lecturerEmail?: string; bookedSlot?: { date?: string; time?: string } };
  const studentId = input.studentId; const lecturerEmail = input.lecturerEmail; const date = input.bookedSlot?.date; const time = input.bookedSlot?.time;
  if (!isNonEmptyString(studentId) || !isNonEmptyString(lecturerEmail) || !isValidEmail(lecturerEmail) || !isNonEmptyString(date) || !isNonEmptyString(time)) return c.json({ success: false, error: "studentId, lecturerEmail, bookedSlot.date, and bookedSlot.time are required" }, 400);
  const payload: SlotBookedPayload = { eventId: `slot-booked-${crypto.randomUUID()}`, eventType: "slot_booked", studentId, lecturerEmail, bookedSlot: { date, time }, serverTimestamp: new Date().toISOString() };
  const body = JSON.stringify(payload); const requestedAt = new Date().toISOString();
  try {
    const response = await fetch(partnerUrl, { method: "POST", headers: { "Content-Type": "application/json", [CAMPUS_INSIGHTS_SIGNATURE_HEADER]: partnerSignature }, body, signal: AbortSignal.timeout(8_000) }); const partnerBody = await response.text();
    await logIntegrationEvent(c.env.advising_db, payload.eventId, payload.eventType, "advising-platform-sender", response.ok ? "sent" : "failed", body, JSON.stringify({ requestedAt, partnerStatus: response.status, partnerBody }));
    return c.json({ success: response.ok, eventId: payload.eventId, requestedAt, partnerStatus: response.status, partnerBody, fallback: !response.ok, recovery: response.ok ? undefined : "Retry manually after the partner has recovered." }, response.ok ? 200 : 502);
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "Partner request timed out" : "Partner webhook request failed";
    await logIntegrationEvent(c.env.advising_db, payload.eventId, payload.eventType, "advising-platform-sender", "failed", body, JSON.stringify({ requestedAt, error: reason }));
    return c.json({ success: false, eventId: payload.eventId, requestedAt, source: "campus-insights", fallback: true, error: reason, recovery: "Retry manually after the partner has recovered." }, 502);
  }
});

export default app;

export type LecturerProfile = {
  uid: string;
  name: string | null;
  email: string | null;
  department: string | null;
  office: string | null;
  title: string | null;
  school_id: string;
  school_name: string;
  reviews: string | null;
  partner_updated_at: string | null;
  is_active: number;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LecturerRecord = {
  uid: string;
  name?: string | null;
  email?: string | null;
  department?: string | null;
  office?: string | null;
  title?: string | null;
  schoolId: string;
  schoolName: string;
  reviews?: unknown;
  updatedAt?: string | null;
};

export type WeeklyAvailability = {
  id: number;
  lecturer_uid: string;
  school_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

export type AvailabilityOverride = {
  id: number;
  lecturer_uid: string;
  school_id: string;
  availability_date: string;
  is_available: number;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
};

export type AvailabilityInput = {
  schoolId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone?: string;
};

export type OverrideInput = {
  schoolId: string;
  date: string;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
  timezone?: string;
};

export type GeneratedSlot = {
  lecturerId: string;
  schoolId: string;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  bookable: boolean;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIMEZONE = "Asia/Bangkok";

export class AvailabilityError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 500 = 400,
  ) {
    super(message);
    this.name = "AvailabilityError";
  }
}

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new AvailabilityError(`${label} is required`);
  return value.trim();
}

function validateTime(value: unknown, label: string): string {
  const time = required(value, label);
  if (!TIME_PATTERN.test(time)) throw new AvailabilityError(`${label} must use HH:MM format`);
  return time;
}

function validateDate(value: unknown): string {
  const date = required(value, "date");
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new AvailabilityError("date must use YYYY-MM-DD format");
  return date;
}

function validateRange(startTime: string, endTime: string): void {
  if (startTime >= endTime) throw new AvailabilityError("endTime must be after startTime");
}

function validateTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new AvailabilityError("timezone must be a valid IANA timezone");
  }
}

export function normalizeLecturerRecord(input: unknown): LecturerRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AvailabilityError("Lecturer record must be a JSON object");
  const record = input as Record<string, unknown>;
  return {
    uid: required(record.uid, "uid"),
    name: typeof record.name === "string" ? record.name.trim() : null,
    email: typeof record.email === "string" ? record.email.trim().toLowerCase() : null,
    department: typeof record.department === "string" ? record.department.trim() : null,
    office: typeof record.office === "string" ? record.office.trim() : null,
    title: typeof record.title === "string" ? record.title.trim() : null,
    schoolId: required(record.schoolId, "schoolId"),
    schoolName: required(record.schoolName, "schoolName"),
    reviews: record.reviews ?? null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

export async function upsertLecturerProfile(db: D1Database, input: unknown): Promise<LecturerProfile> {
  const lecturer = normalizeLecturerRecord(input);
  await db.prepare(`
    INSERT INTO lecturer_profiles
      (uid, name, email, department, office, title, school_id, school_name, reviews, partner_updated_at, synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(uid) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      department = excluded.department,
      office = excluded.office,
      title = excluded.title,
      school_id = excluded.school_id,
      school_name = excluded.school_name,
      reviews = excluded.reviews,
      partner_updated_at = excluded.partner_updated_at,
      synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    lecturer.uid,
    lecturer.name ?? null,
    lecturer.email ?? null,
    lecturer.department ?? null,
    lecturer.office ?? null,
    lecturer.title ?? null,
    lecturer.schoolId,
    lecturer.schoolName,
    lecturer.reviews == null ? null : JSON.stringify(lecturer.reviews),
    lecturer.updatedAt ?? null,
  ).run();
  const result = await db.prepare("SELECT * FROM lecturer_profiles WHERE uid = ?").bind(lecturer.uid).first<LecturerProfile>();
  if (!result) throw new AvailabilityError("Lecturer profile could not be retrieved after upsert", 500);
  return result;
}

export function validateAvailabilityInput(input: AvailabilityInput): AvailabilityInput {
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) throw new AvailabilityError("dayOfWeek must be between 0 and 6");
  const startTime = validateTime(input.startTime, "startTime");
  const endTime = validateTime(input.endTime, "endTime");
  validateRange(startTime, endTime);
  const timezone = validateTimezone(input.timezone ?? DEFAULT_TIMEZONE);
  return { schoolId: required(input.schoolId, "schoolId"), dayOfWeek: input.dayOfWeek, startTime, endTime, timezone };
}

export function validateOverrideInput(input: OverrideInput): OverrideInput {
  const date = validateDate(input.date);
  const schoolId = required(input.schoolId, "schoolId");
  const timezone = validateTimezone(input.timezone ?? DEFAULT_TIMEZONE);
  if (!input.isAvailable) return { schoolId, date, isAvailable: false, timezone };
  const startTime = validateTime(input.startTime, "startTime");
  const endTime = validateTime(input.endTime, "endTime");
  validateRange(startTime, endTime);
  return { schoolId, date, isAvailable: true, startTime, endTime, timezone };
}

function utcForLocal(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const displayed = Date.UTC(values.year, values.month - 1, values.day, values.hour === 24 ? 0 : values.hour, values.minute);
  return new Date(guess - (displayed - guess));
}

function displayDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function generateLecturerSlots(
  db: D1Database,
  lecturerUid: string,
  date: string,
  durationMinutes: number,
  now = new Date(),
  includeUnbookable = false,
): Promise<GeneratedSlot[]> {
  const targetDate = validateDate(date);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 240) throw new AvailabilityError("durationMinutes must be between 1 and 240");
  const lecturer = await db.prepare("SELECT * FROM lecturer_profiles WHERE uid = ?").bind(lecturerUid).first<LecturerProfile>();
  if (!lecturer) throw new AvailabilityError("Lecturer not found", 404);
  const dayOfWeek = new Date(`${targetDate}T00:00:00Z`).getUTCDay();
  const override = await db.prepare("SELECT * FROM lecturer_availability_overrides WHERE lecturer_uid = ? AND availability_date = ?").bind(lecturerUid, targetDate).first<AvailabilityOverride>();
  const ranges = override
    ? (override.is_available ? [{ start_time: override.start_time!, end_time: override.end_time!, timezone: override.timezone }] : [])
    : (await db.prepare("SELECT start_time, end_time, timezone FROM lecturer_weekly_availability WHERE lecturer_uid = ? AND school_id = ? AND day_of_week = ? ORDER BY start_time").bind(lecturerUid, lecturer.school_id, dayOfWeek).all<{ start_time: string; end_time: string; timezone: string }>()).results ?? [];
  const advisor = lecturer.email
    ? await db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND role = 'ADVISOR'").bind(lecturer.email).first<{ id: string }>()
    : null;
  const booked = advisor
    ? (await db.prepare("SELECT starts_at, ends_at FROM advisor_slots WHERE advisor_id = ? AND status IN ('open', 'booked')").bind(advisor.id).all<{ starts_at: string; ends_at: string }>()).results ?? []
    : [];
  const slots: GeneratedSlot[] = [];
  for (const range of ranges) {
    const startMinutes = Number(range.start_time.slice(0, 2)) * 60 + Number(range.start_time.slice(3));
    const endMinutes = Number(range.end_time.slice(0, 2)) * 60 + Number(range.end_time.slice(3));
    for (let minute = startMinutes; minute + durationMinutes <= endMinutes; minute += durationMinutes) {
      const startTime = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      const endMinute = minute + durationMinutes;
      const endTime = `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
      const startsAt = utcForLocal(targetDate, startTime, range.timezone);
      const endsAt = utcForLocal(targetDate, endTime, range.timezone);
      const overlaps = booked.some((booking) => new Date(booking.starts_at) < endsAt && new Date(booking.ends_at) > startsAt);
      slots.push({ lecturerId: lecturerUid, schoolId: lecturer.school_id, date: targetDate, startTime, endTime, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), timezone: range.timezone, bookable: startsAt.getTime() >= now.getTime() + 2 * 60 * 60 * 1000 && !overlaps && Boolean(advisor) });
    }
  }
  return includeUnbookable ? slots : slots.filter((slot) => slot.bookable);
}

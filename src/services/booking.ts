
export type BookingErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "TOO_LATE"
  | "DATABASE_ERROR";

export class BookingError extends Error {
  constructor(
    message: string,
    public readonly code: BookingErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

export interface CreateSlotInput {
  advisorId: string;
  startsAt: string;
  endsAt: string;
}

export interface AdvisorSlot {
  id: string;
  advisor_id: string;
  starts_at: string;
  ends_at: string;
  status: "open" | "booked" | "cancelled";
  created_at: string;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export async function createSlot(
  db: D1Database,
  input: CreateSlotInput,
): Promise<AdvisorSlot> {
  const { advisorId, startsAt, endsAt } = input;

  if (!advisorId || !isValidDate(startsAt) || !isValidDate(endsAt)) {
    throw new BookingError(
      "advisorId, startsAt, and endsAt must be valid.",
      "INVALID_INPUT",
      400,
    );
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (start.getTime() <= Date.now()) {
    throw new BookingError(
      "A slot must start in the future.",
      "INVALID_INPUT",
      400,
    );
  }

  if (end.getTime() <= start.getTime()) {
    throw new BookingError(
      "The slot end time must be after its start time.",
      "INVALID_INPUT",
      400,
    );
  }

  const advisor = await db
    .prepare(
      "SELECT id FROM users WHERE id = ? AND role IN ('advisor', 'ADVISOR') AND is_active = 1",
    )
    .bind(advisorId)
    .first<{ id: string }>();

  if (!advisor) {
    throw new BookingError(
      "Active advisor not found.",
      "NOT_FOUND",
      404,
    );
  }

  const slot = await db
    .prepare(`
      INSERT INTO advisor_slots (id, advisor_id, starts_at, ends_at, status)
      SELECT ?, ?, ?, ?, 'open'
      WHERE NOT EXISTS (
        SELECT 1
        FROM advisor_slots
        WHERE advisor_id = ?
          AND status != 'cancelled'
          AND starts_at < ?
          AND ends_at > ?
      )
      RETURNING *
    `)
    .bind(
      crypto.randomUUID(),
      advisorId,
      start.toISOString(),
      end.toISOString(),
      advisorId,
      end.toISOString(),
      start.toISOString(),
    )
    .first<AdvisorSlot>();

  if (!slot) {
    throw new BookingError(
      "This advisor already has a slot during that time.",
      "CONFLICT",
      409,
    );
  }

  return slot;
}

export interface ListSlotsFilters {
  advisorId?: string;
  from?: string;
  to?: string;
}

export async function listAvailableSlots(
  db: D1Database,
  filters: ListSlotsFilters = {},
): Promise<AdvisorSlot[]> {
  const { advisorId, from, to } = filters;

  if (from && !isValidDate(from)) {
    throw new BookingError(
      "The from filter must be a valid date.",
      "INVALID_INPUT",
      400,
    );
  }

  if (to && !isValidDate(to)) {
    throw new BookingError(
      "The to filter must be a valid date.",
      "INVALID_INPUT",
      400,
    );
  }

  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  if (
    fromDate &&
    toDate &&
    fromDate.getTime() > toDate.getTime()
  ) {
    throw new BookingError(
      "The from date must be before the to date.",
      "INVALID_INPUT",
      400,
    );
  }

  let sql = `
    SELECT *
    FROM advisor_slots
    WHERE status = 'open'
      AND starts_at > ?
  `;

  const values: (string | number)[] = [new Date().toISOString()];

  if (advisorId) {
    sql += " AND advisor_id = ?";
    values.push(advisorId);
  }

  if (fromDate) {
    sql += " AND starts_at >= ?";
    values.push(fromDate.toISOString());
  }

  if (toDate) {
    sql += " AND starts_at <= ?";
    values.push(toDate.toISOString());
  }

  sql += " ORDER BY starts_at ASC";

  const result = await db
    .prepare(sql)
    .bind(...values)
    .all<AdvisorSlot>();

  return result.results ?? [];
}

export async function getSlotById(
  db: D1Database,
  slotId: string,
): Promise<AdvisorSlot> {
  if (!slotId) {
    throw new BookingError(
      "Slot ID is required.",
      "INVALID_INPUT",
      400,
    );
  }

  const slot = await db
    .prepare("SELECT * FROM advisor_slots WHERE id = ?")
    .bind(slotId)
    .first<AdvisorSlot>();

  if (!slot) {
    throw new BookingError(
      "Slot not found.",
      "NOT_FOUND",
      404,
    );
  }

  return slot;
}

export async function cancelSlot(
  db: D1Database,
  slotId: string,
  advisorId: string,
): Promise<AdvisorSlot> {
  if (!slotId || !advisorId) {
    throw new BookingError(
      "Slot ID and advisor ID are required.",
      "INVALID_INPUT",
      400,
    );
  }

  const slot = await db
    .prepare(`
      UPDATE advisor_slots
      SET status = 'cancelled'
      WHERE id = ?
        AND advisor_id = ?
        AND status = 'open'
        AND starts_at > ?
      RETURNING *
    `)
    .bind(slotId, advisorId, new Date().toISOString())
    .first<AdvisorSlot>();

  if (slot) {
    return slot;
  }

  const existing = await db
    .prepare("SELECT id, advisor_id, status FROM advisor_slots WHERE id = ?")
    .bind(slotId)
    .first<{ id: string; advisor_id: string; status: string }>();

  if (!existing) {
    throw new BookingError("Slot not found.", "NOT_FOUND", 404);
  }

  if (existing.advisor_id !== advisorId) {
    throw new BookingError(
      "You cannot cancel another advisor's slot.",
      "FORBIDDEN",
      403,
    );
  }

  throw new BookingError(
    "Only future open slots can be cancelled.",
    "CONFLICT",
    409,
  );
}

export interface BookAppointmentInput {
  slotId: string;
  studentId: string;
  agendaRaw: string;
}

export interface Appointment {
  id: string;
  slot_id: string;
  student_id: string;
  advisor_id: string;
  agenda_raw: string;
  agenda_summary: string | null;
  status: "booked" | "cancelled" | "completed";
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
}

export async function bookAppointment(
  db: D1Database,
  input: BookAppointmentInput,
): Promise<Appointment> {
  const slotId = input.slotId?.trim();
  const studentId = input.studentId?.trim();
  const agendaRaw = input.agendaRaw?.trim();

  if (!slotId || !studentId || !agendaRaw || agendaRaw.length > 5000) {
    throw new BookingError(
      "slotId, studentId, and a valid agenda (maximum 5000 characters) are required.",
      "INVALID_INPUT",
      400,
    );
  }

  const student = await db
    .prepare(
      "SELECT id FROM users WHERE id = ? AND role IN ('student', 'STUDENT') AND is_active = 1",
    )
    .bind(studentId)
    .first<{ id: string }>();

  if (!student) {
    throw new BookingError(
      "Active student not found.",
      "NOT_FOUND",
      404,
    );
  }

  const slot = await db
    .prepare("SELECT * FROM advisor_slots WHERE id = ?")
    .bind(slotId)
    .first<AdvisorSlot>();

  if (!slot) {
    throw new BookingError("Slot not found.", "NOT_FOUND", 404);
  }

  const minimumStart = Date.now() + 2 * 60 * 60 * 1000;

  if (new Date(slot.starts_at).getTime() < minimumStart) {
    throw new BookingError(
      "Appointments must be booked at least 2 hours in advance.",
      "TOO_LATE",
      400,
    );
  }

  if (slot.status !== "open") {
    throw new BookingError(
      "This slot is no longer available.",
      "CONFLICT",
      409,
    );
  }

  const advisor = await db
    .prepare(
      "SELECT id FROM users WHERE id = ? AND role IN ('advisor', 'ADVISOR') AND is_active = 1",
    )
    .bind(slot.advisor_id)
    .first<{ id: string }>();

  if (!advisor) {
    throw new BookingError(
      "The advisor is not currently active.",
      "CONFLICT",
      409,
    );
  }

  const overlap = await db
    .prepare(`
      SELECT a.id
      FROM appointments a
      JOIN advisor_slots s ON s.id = a.slot_id
      WHERE a.student_id = ?
        AND a.status = 'booked'
        AND s.starts_at < ?
        AND s.ends_at > ?
      LIMIT 1
    `)
    .bind(studentId, slot.ends_at, slot.starts_at)
    .first<{ id: string }>();

  if (overlap) {
    throw new BookingError(
      "You already have an appointment during this time.",
      "CONFLICT",
      409,
    );
  }

  const appointmentId = crypto.randomUUID();

  const results = await db.batch([
    db.prepare(`
      INSERT INTO appointments (
        id,
        slot_id,
        student_id,
        advisor_id,
        agenda_raw,
        status
      )
      SELECT ?, ?, ?, ?, ?, 'booked'
      WHERE EXISTS (
        SELECT 1 FROM advisor_slots
        WHERE id = ? AND status = 'open' AND starts_at >= ?
      )
      AND NOT EXISTS (
        SELECT 1 FROM appointments
        WHERE slot_id = ? AND status = 'booked'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM appointments a
        JOIN advisor_slots s ON s.id = a.slot_id
        WHERE a.student_id = ?
          AND a.status = 'booked'
          AND s.starts_at < ?
          AND s.ends_at > ?
      )
    `).bind(
      appointmentId,
      slotId,
      studentId,
      slot.advisor_id,
      agendaRaw,
      slotId,
      new Date(minimumStart).toISOString(),
      slotId,
      studentId,
      slot.ends_at,
      slot.starts_at,
    ),

    db.prepare(`
      UPDATE advisor_slots
      SET status = 'booked'
      WHERE id = ?
        AND status = 'open'
        AND EXISTS (
          SELECT 1 FROM appointments
          WHERE id = ? AND status = 'booked'
        )
    `).bind(slotId, appointmentId),
  ]);

  if (
    results[0]?.meta?.changes !== 1 ||
    results[1]?.meta?.changes !== 1
  ) {
    throw new BookingError(
      "This slot is no longer available or conflicts with your schedule. Please refresh and try another slot.",
      "CONFLICT",
      409,
    );
  }

  const appointment = await db
    .prepare("SELECT * FROM appointments WHERE id = ?")
    .bind(appointmentId)
    .first<Appointment>();

  if (!appointment) {
    throw new BookingError(
      "The appointment could not be retrieved after booking.",
      "DATABASE_ERROR",
      500,
    );
  }

  return appointment;
}

export async function cancelAppointment(
  db: D1Database,
  appointmentId: string,
  studentId: string,
): Promise<Appointment> {
  if (!appointmentId?.trim() || !studentId?.trim()) {
    throw new BookingError(
      "Appointment ID and student ID are required.",
      "INVALID_INPUT",
      400,
    );
  }

  const appointment = await db
    .prepare(`
      SELECT a.*, s.starts_at
      FROM appointments a
      JOIN advisor_slots s ON s.id = a.slot_id
      WHERE a.id = ?
    `)
    .bind(appointmentId)
    .first<Appointment & { starts_at: string }>();

  if (!appointment) {
    throw new BookingError(
      "Appointment not found.",
      "NOT_FOUND",
      404,
    );
  }

  if (appointment.student_id !== studentId) {
    throw new BookingError(
      "You cannot cancel another student's appointment.",
      "FORBIDDEN",
      403,
    );
  }

  if (appointment.status !== "booked") {
    throw new BookingError(
      "Only booked appointments can be cancelled.",
      "CONFLICT",
      409,
    );
  }

  const now = new Date();
  const cancellationTime = now.toISOString();
  const minimumCancellationTime = new Date(
    now.getTime() + 60 * 60 * 1000,
  ).toISOString();

  if (new Date(appointment.starts_at).getTime() < Date.parse(minimumCancellationTime)) {
    throw new BookingError(
      "Cancellation is only allowed at least 1 hour before the appointment.",
      "TOO_LATE",
      400,
    );
  }

  const results = await db.batch([
    db.prepare(`
      UPDATE appointments
      SET status = 'cancelled',
          cancelled_at = ?,
          updated_at = ?
      WHERE id = ?
        AND student_id = ?
        AND status = 'booked'
        AND EXISTS (
          SELECT 1
          FROM advisor_slots s
          WHERE s.id = appointments.slot_id
            AND s.status = 'booked'
            AND s.starts_at >= ?
        )
    `).bind(
      cancellationTime,
      cancellationTime,
      appointmentId,
      studentId,
      minimumCancellationTime,
    ),

    db.prepare(`
      UPDATE advisor_slots
      SET status = 'open'
      WHERE id = (
        SELECT slot_id
        FROM appointments
        WHERE id = ?
          AND student_id = ?
          AND status = 'cancelled'
          AND cancelled_at = ?
      )
      AND status = 'booked'
    `).bind(
      appointmentId,
      studentId,
      cancellationTime,
    ),
  ]);

  if (results[0]?.meta?.changes !== 1) {
    throw new BookingError(
      "The appointment could not be cancelled. Please refresh and try again.",
      "CONFLICT",
      409,
    );
  }

  if (results[1]?.meta?.changes !== 1) {
    throw new BookingError(
      "The appointment was cancelled, but its slot could not be reopened. Please contact an administrator.",
      "DATABASE_ERROR",
      500,
    );
  }

  const cancelledAppointment = await db
    .prepare("SELECT * FROM appointments WHERE id = ?")
    .bind(appointmentId)
    .first<Appointment>();

  if (!cancelledAppointment) {
    throw new BookingError(
      "Could not retrieve the cancelled appointment.",
      "DATABASE_ERROR",
      500,
    );
  }

  return cancelledAppointment;
}

export async function completeAppointment(
  db: D1Database,
  appointmentId: string,
  advisorId: string,
): Promise<Appointment> {
  if (!appointmentId.trim() || !advisorId.trim()) {
    throw new BookingError(
      "Appointment ID and advisor ID are required.",
      "INVALID_INPUT",
      400,
    );
  }

  const appointment = await db
    .prepare(`
      SELECT *
      FROM appointments
      WHERE id = ?
    `)
    .bind(appointmentId)
    .first<Appointment>();

  if (!appointment) {
    throw new BookingError(
      "Appointment not found.",
      "NOT_FOUND",
      404,
    );
  }

  if (appointment.advisor_id !== advisorId) {
    throw new BookingError(
      "You are not authorized to complete this appointment.",
      "FORBIDDEN",
      403,
    );
  }

  if (appointment.status !== "booked") {
    throw new BookingError(
      "Only booked appointments can be completed.",
      "CONFLICT",
      409,
    );
  }

  const completedAt = new Date().toISOString();

  const result = await db
    .prepare(`
      UPDATE appointments
      SET status = 'completed',
          completed_at = ?,
          updated_at = ?
      WHERE id = ?
        AND advisor_id = ?
        AND status = 'booked'
    `)
    .bind(
      completedAt,
      completedAt,
      appointmentId,
      advisorId,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new BookingError(
      "The appointment could not be completed. Please refresh and try again.",
      "CONFLICT",
      409,
    );
  }

  const completedAppointment = await db
    .prepare("SELECT * FROM appointments WHERE id = ?")
    .bind(appointmentId)
    .first<Appointment>();

  if (!completedAppointment) {
    throw new BookingError(
      "Could not retrieve the completed appointment.",
      "DATABASE_ERROR",
      500,
    );
  }

  return completedAppointment;
}

export type AppointmentViewerRole = "student" | "advisor" | "admin";

export async function listAppointments(
  db: D1Database,
  viewerId: string,
  viewerRole: AppointmentViewerRole,
): Promise<Appointment[]> {
  if (!viewerId.trim()) {
    throw new BookingError(
      "User ID is required.",
      "INVALID_INPUT",
      400,
    );
  }

  let query: string;
  let statement;

  if (viewerRole === "student") {
    query = `
      SELECT *
      FROM appointments
      WHERE student_id = ?
      ORDER BY created_at DESC
    `;
    statement = db.prepare(query).bind(viewerId);
  } else if (viewerRole === "advisor") {
    query = `
      SELECT *
      FROM appointments
      WHERE advisor_id = ?
      ORDER BY created_at DESC
    `;
    statement = db.prepare(query).bind(viewerId);
  } else if (viewerRole === "admin") {
    query = `
      SELECT *
      FROM appointments
      ORDER BY created_at DESC
    `;
    statement = db.prepare(query);
  } else {
    throw new BookingError(
      "Invalid user role.",
      "FORBIDDEN",
      403,
    );
  }

  const result = await statement.all<Appointment>();
  return result.results ?? [];
}

export async function getAppointmentById(
  db: D1Database,
  appointmentId: string,
  viewerId: string,
  viewerRole: AppointmentViewerRole,
): Promise<Appointment> {
  if (!appointmentId.trim() || !viewerId.trim()) {
    throw new BookingError(
      "Appointment ID and user ID are required.",
      "INVALID_INPUT",
      400,
    );
  }

  let query: string;
  let statement;

  if (viewerRole === "student") {
    query = `
      SELECT *
      FROM appointments
      WHERE id = ? AND student_id = ?
    `;
    statement = db.prepare(query).bind(appointmentId, viewerId);
  } else if (viewerRole === "advisor") {
    query = `
      SELECT *
      FROM appointments
      WHERE id = ? AND advisor_id = ?
    `;
    statement = db.prepare(query).bind(appointmentId, viewerId);
  } else if (viewerRole === "admin") {
    query = `
      SELECT *
      FROM appointments
      WHERE id = ?
    `;
    statement = db.prepare(query).bind(appointmentId);
  } else {
    throw new BookingError(
      "Invalid user role.",
      "FORBIDDEN",
      403,
    );
  }

  const appointment = await statement.first<Appointment>();

  if (!appointment) {
    throw new BookingError(
      "Appointment not found.",
      "NOT_FOUND",
      404,
    );
  }

  return appointment;
}

export interface AppointmentNote {
  id: string;
  appointment_id: string;
  author_id: string;
  visibility: "private" | "shared";
  body: string;
  created_at: string;
}

export async function createAppointmentNote(
  db: D1Database,
  appointmentId: string,
  advisorId: string,
  visibility: "private" | "shared",
  body: string,
): Promise<AppointmentNote> {
  const cleanBody = body?.trim();

  if (
    !appointmentId.trim() ||
    !advisorId.trim() ||
    !["private", "shared"].includes(visibility) ||
    !cleanBody ||
    cleanBody.length > 5000
  ) {
    throw new BookingError(
      "Valid appointment ID, advisor ID, visibility, and note body (maximum 5000 characters) are required.",
      "INVALID_INPUT",
      400,
    );
  }

  const appointment = await db
    .prepare(`
      SELECT id, advisor_id, status
      FROM appointments
      WHERE id = ?
    `)
    .bind(appointmentId)
    .first<{
      id: string;
      advisor_id: string;
      status: string;
    }>();

  if (!appointment) {
    throw new BookingError(
      "Appointment not found.",
      "NOT_FOUND",
      404,
    );
  }

  if (appointment.advisor_id !== advisorId) {
    throw new BookingError(
      "You are not authorized to write notes for this appointment.",
      "FORBIDDEN",
      403,
    );
  }

  if (appointment.status !== "completed") {
    throw new BookingError(
      "Notes can only be added after the appointment is completed.",
      "CONFLICT",
      409,
    );
  }

  const note = await db
    .prepare(`
      INSERT INTO appointment_notes (
        id,
        appointment_id,
        author_id,
        visibility,
        body
      )
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `)
    .bind(
      crypto.randomUUID(),
      appointmentId,
      advisorId,
      visibility,
      cleanBody,
    )
    .first<AppointmentNote>();

  if (!note) {
    throw new BookingError(
      "Could not create appointment note.",
      "DATABASE_ERROR",
      500,
    );
  }

  return note;
}

export async function listAppointmentNotes(
  db: D1Database,
  appointmentId: string,
  viewerId: string,
  viewerRole: AppointmentViewerRole,
): Promise<AppointmentNote[]> {
  if (!appointmentId.trim() || !viewerId.trim()) {
    throw new BookingError(
      "Appointment ID and user ID are required.",
      "INVALID_INPUT",
      400,
    );
  }

  const appointment = await db
    .prepare(`
      SELECT id, student_id, advisor_id
      FROM appointments
      WHERE id = ?
    `)
    .bind(appointmentId)
    .first<{
      id: string;
      student_id: string;
      advisor_id: string;
    }>();

  if (!appointment) {
    throw new BookingError(
      "Appointment not found.",
      "NOT_FOUND",
      404,
    );
  }

  let query: string;

  if (viewerRole === "student") {
    if (appointment.student_id !== viewerId) {
      throw new BookingError(
        "You are not authorized to view these notes.",
        "FORBIDDEN",
        403,
      );
    }

    query = `
      SELECT id, appointment_id, author_id, visibility, body, created_at
      FROM appointment_notes
      WHERE appointment_id = ? AND visibility = 'shared'
      ORDER BY created_at ASC
    `;
  } else if (viewerRole === "advisor") {
    if (appointment.advisor_id !== viewerId) {
      throw new BookingError(
        "You are not authorized to view these notes.",
        "FORBIDDEN",
        403,
      );
    }

    query = `
      SELECT id, appointment_id, author_id, visibility, body, created_at
      FROM appointment_notes
      WHERE appointment_id = ?
      ORDER BY created_at ASC
    `;
  } else if (viewerRole === "admin") {
    query = `
      SELECT id, appointment_id, author_id, visibility, body, created_at
      FROM appointment_notes
      WHERE appointment_id = ?
      ORDER BY created_at ASC
    `;
  } else {
    throw new BookingError(
      "Invalid user role.",
      "FORBIDDEN",
      403,
    );
  }

  const result = await db
    .prepare(query)
    .bind(appointmentId)
    .all<AppointmentNote>();

  return result.results ?? [];
}

export async function updateAppointmentNote(
  db: D1Database,
  noteId: string,
  advisorId: string,
  updates: {
    body?: string;
    visibility?: "private" | "shared";
  },
): Promise<AppointmentNote> {
  if (!noteId.trim() || !advisorId.trim()) {
    throw new BookingError(
      "Note ID and advisor ID are required.",
      "INVALID_INPUT",
      400,
    );
  }

  const hasBody = updates.body !== undefined;
  const hasVisibility = updates.visibility !== undefined;

  if (!hasBody && !hasVisibility) {
    throw new BookingError(
      "At least one field (body or visibility) must be provided.",
      "INVALID_INPUT",
      400,
    );
  }

  const cleanBody = hasBody ? updates.body!.trim() : undefined;

  if (
    (hasBody && (!cleanBody || cleanBody.length > 5000)) ||
    (hasVisibility &&
      !["private", "shared"].includes(updates.visibility!))
  ) {
    throw new BookingError(
      "Invalid note body or visibility.",
      "INVALID_INPUT",
      400,
    );
  }

  const note = await db
    .prepare(`
      SELECT
        n.id,
        n.appointment_id,
        n.author_id,
        n.visibility,
        n.body,
        n.created_at,
        a.advisor_id,
        a.status AS appointment_status
      FROM appointment_notes n
      JOIN appointments a ON a.id = n.appointment_id
      WHERE n.id = ?
    `)
    .bind(noteId)
    .first<AppointmentNote & {
      advisor_id: string;
      appointment_status: string;
    }>();

  if (!note) {
    throw new BookingError(
      "Appointment note not found.",
      "NOT_FOUND",
      404,
    );
  }

  if (note.advisor_id !== advisorId || note.author_id !== advisorId) {
    throw new BookingError(
      "You are not authorized to edit this note.",
      "FORBIDDEN",
      403,
    );
  }

  if (note.appointment_status !== "completed") {
    throw new BookingError(
      "Notes can only be edited after the appointment is completed.",
      "CONFLICT",
      409,
    );
  }

  const result = await db
    .prepare(`
      UPDATE appointment_notes
      SET body = ?, visibility = ?
      WHERE id = ?
        AND author_id = ?
        AND EXISTS (
          SELECT 1
          FROM appointments a
          WHERE a.id = appointment_notes.appointment_id
            AND a.advisor_id = ?
            AND a.status = 'completed'
        )
    `)
    .bind(
      hasBody ? cleanBody : note.body,
      hasVisibility ? updates.visibility : note.visibility,
      noteId,
      advisorId,
      advisorId,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new BookingError(
      "The note could not be updated. Please refresh and try again.",
      "CONFLICT",
      409,
    );
  }

  const updatedNote = await db
    .prepare(`
      SELECT *
      FROM appointment_notes
      WHERE id = ?
    `)
    .bind(noteId)
    .first<AppointmentNote>();

  if (!updatedNote) {
    throw new BookingError(
      "Could not retrieve the updated note.",
      "DATABASE_ERROR",
      500,
    );
  }

  return updatedNote;
}

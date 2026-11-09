PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADVISOR', 'ADMIN')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    password_hash TEXT,
    password_salt TEXT,
    password_iterations INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS advisor_slots (
    id TEXT PRIMARY KEY,
    advisor_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'booked', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (advisor_id) REFERENCES users(id),
    CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_advisor_slots_browse
    ON advisor_slots(status, starts_at);

CREATE INDEX IF NOT EXISTS idx_advisor_slots_advisor
    ON advisor_slots(advisor_id, starts_at);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    slot_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    advisor_id TEXT NOT NULL,
    agenda_raw TEXT NOT NULL,
    agenda_summary TEXT,
    status TEXT NOT NULL DEFAULT 'booked'
        CHECK (status IN ('booked', 'cancelled', 'completed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (slot_id) REFERENCES advisor_slots(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (advisor_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_active_slot
    ON appointments(slot_id)
    WHERE status = 'booked';

CREATE INDEX IF NOT EXISTS idx_appointments_student
    ON appointments(student_id, created_at);

CREATE INDEX IF NOT EXISTS idx_appointments_advisor
    ON appointments(advisor_id, created_at);

CREATE TABLE IF NOT EXISTS appointment_notes (
    id TEXT PRIMARY KEY,
    appointment_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    visibility TEXT NOT NULL
        CHECK (visibility IN ('private', 'shared')),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_appointment_notes_appointment
    ON appointment_notes(appointment_id, created_at);

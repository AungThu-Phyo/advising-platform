PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lecturer_date_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lecturer_uid TEXT NOT NULL REFERENCES lecturer_profiles(uid) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    slot_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'booked', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lecturer_uid, slot_date, start_time, end_time),
    CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_lecturer_date_slots_lookup
    ON lecturer_date_slots(lecturer_uid, slot_date, status);

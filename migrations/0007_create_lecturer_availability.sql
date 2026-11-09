PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lecturer_profiles (
    uid TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    department TEXT,
    office TEXT,
    title TEXT,
    school_id TEXT NOT NULL,
    school_name TEXT NOT NULL,
    reviews TEXT,
    partner_updated_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lecturer_profiles_school
    ON lecturer_profiles(school_id);

CREATE INDEX IF NOT EXISTS idx_lecturer_profiles_department
    ON lecturer_profiles(department);

CREATE TABLE IF NOT EXISTS lecturer_weekly_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lecturer_uid TEXT NOT NULL REFERENCES lecturer_profiles(uid) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_lecturer_weekly_availability_lookup
    ON lecturer_weekly_availability(lecturer_uid, school_id, day_of_week);

CREATE TABLE IF NOT EXISTS lecturer_availability_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lecturer_uid TEXT NOT NULL REFERENCES lecturer_profiles(uid) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    availability_date TEXT NOT NULL,
    is_available INTEGER NOT NULL CHECK (is_available IN (0, 1)),
    start_time TEXT,
    end_time TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lecturer_uid, availability_date),
    CHECK (
        (is_available = 0 AND start_time IS NULL AND end_time IS NULL)
        OR
        (is_available = 1 AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    )
);

CREATE INDEX IF NOT EXISTS idx_lecturer_availability_overrides_lookup
    ON lecturer_availability_overrides(lecturer_uid, school_id, availability_date);

ALTER TABLE lecturer_profiles ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE lecturer_profiles ADD COLUMN synced_at TEXT;

UPDATE lecturer_profiles
SET synced_at = COALESCE(synced_at, updated_at, CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_lecturer_profiles_login_email
ON lecturer_profiles(email COLLATE NOCASE, is_active);

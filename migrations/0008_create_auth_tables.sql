-- Upgrade the users table created by 0003_create_advising_mvp.sql.
-- The original auth migration used the same version and a conflicting schema.
PRAGMA foreign_keys = OFF;

CREATE TABLE users_auth (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADVISOR', 'ADMIN')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  advisor_email TEXT,
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users_auth (
  id, email, name, role, is_active, advisor_email, created_at
)
SELECT
  id, email, display_name, UPPER(role), is_active, advisor_email, created_at
FROM users;

DROP TABLE users;
ALTER TABLE users_auth RENAME TO users;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

PRAGMA foreign_keys = ON;

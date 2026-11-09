ALTER TABLE users ADD COLUMN advisor_password_set INTEGER NOT NULL DEFAULT 0
  CHECK (advisor_password_set IN (0, 1));

CREATE TABLE IF NOT EXISTS principal (
  member_key TEXT PRIMARY KEY,
  identity TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL
);

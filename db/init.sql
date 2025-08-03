-- SQLite

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

/* dead-simple key / value state for now */
create table if not exists ezd_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

create table if not exists ezd_device (
  ezd_device_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

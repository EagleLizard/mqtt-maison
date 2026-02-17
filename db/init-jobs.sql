
PRAGMA journal_mode = WAL;
PRAGMA synchronous = 1;
PRAGMA busy_timeout = 5000;

create table if not exists jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT,
  data TEXT,
  status TEXT DEFAULT 'pending',
  run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

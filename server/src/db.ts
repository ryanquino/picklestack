import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  court_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  pairing_mode TEXT NOT NULL DEFAULT 'smart',
  court_name TEXT DEFAULT '',
  court_names TEXT DEFAULT '{}',
  session_type TEXT NOT NULL DEFAULT 'open_play',
  game_mode TEXT NOT NULL DEFAULT 'doubles',
  matching_mode TEXT NOT NULL DEFAULT 'smart',
  session_duration_hours REAL NOT NULL DEFAULT 4,
  live_view_url TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  checked_in_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixed_pairs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  player1_id TEXT NOT NULL REFERENCES players(id),
  player2_id TEXT NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fixed_pairs_session
  ON fixed_pairs(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fixed_pairs_player1
  ON fixed_pairs(session_id, player1_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fixed_pairs_player2
  ON fixed_pairs(session_id, player2_id);

CREATE TABLE IF NOT EXISTS queue_entries (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  position INTEGER NOT NULL,
  pair_id TEXT REFERENCES fixed_pairs(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  court_number INTEGER NOT NULL,
  player_ids TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_court
  ON matches(session_id, court_number) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS match_results (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  winner_player_ids TEXT NOT NULL,
  loser_player_ids TEXT NOT NULL,
  team1_score INTEGER DEFAULT NULL,
  team2_score INTEGER DEFAULT NULL,
  recorded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_ratings (
  player_id TEXT NOT NULL REFERENCES players(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  rating INTEGER NOT NULL DEFAULT 1000,
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  star_rating INTEGER NOT NULL DEFAULT 3,
  PRIMARY KEY (player_id, session_id)
);

CREATE TABLE IF NOT EXISTS pairing_history (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  player1_id TEXT NOT NULL,
  player2_id TEXT NOT NULL,
  times_as_teammates INTEGER NOT NULL DEFAULT 0,
  times_as_opponents INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, player1_id, player2_id)
);

CREATE TABLE IF NOT EXISTS player_achievements (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  awarded_at TEXT NOT NULL,
  UNIQUE(player_id, session_id, kind)
);

CREATE TABLE IF NOT EXISTS match_quality_scores (
  match_id TEXT PRIMARY KEY REFERENCES matches(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  score_closeness_score INTEGER NOT NULL,
  rating_balance_score INTEGER NOT NULL,
  freshness_score INTEGER NOT NULL,
  match_quality_rating INTEGER NOT NULL,
  has_scores INTEGER NOT NULL DEFAULT 1,
  computed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_match_quality_session
  ON match_quality_scores(session_id);
`;

/**
 * Returns the singleton database instance, initializing it on first call.
 * The database file is stored at data/picklestack.db relative to the server root.
 * WAL mode is enabled for better concurrent read performance.
 */
export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  // Use /tmp for serverless/restricted environments, otherwise use data/ relative to cwd
  const dataDir = process.env.DB_PATH
    ? path.dirname(process.env.DB_PATH)
    : path.resolve(process.cwd(), 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = process.env.DB_PATH || path.join(dataDir, 'picklestack.db');
  console.log(`[DB] Opening database at: ${dbPath}`);
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create schema
  db.exec(SCHEMA);

  // Migration: Add pair_id column to queue_entries if it doesn't exist (for existing databases)
  const queueColumnsInfo = db.pragma('table_info(queue_entries)') as Array<{ name: string }>;
  const hasPairId = queueColumnsInfo.some((col) => col.name === 'pair_id');
  if (!hasPairId) {
    db.exec('ALTER TABLE queue_entries ADD COLUMN pair_id TEXT REFERENCES fixed_pairs(id)');
  }

  // Migration: Add session_duration_hours column to sessions if it doesn't exist
  const sessionColumnsInfo = db.pragma('table_info(sessions)') as Array<{ name: string }>;
  const hasDurationHours = sessionColumnsInfo.some((col) => col.name === 'session_duration_hours');
  if (!hasDurationHours) {
    db.exec('ALTER TABLE sessions ADD COLUMN session_duration_hours REAL NOT NULL DEFAULT 4');
  }

  return db;
}

/**
 * Closes the database connection. Useful for testing cleanup.
 * Performs a WAL checkpoint before closing to release file locks on Windows.
 */
export function closeDb(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore errors during checkpoint (e.g., if DB is already in DELETE mode)
    }
    db.close();
    db = null;
  }
}

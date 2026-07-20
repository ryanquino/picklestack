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
  pairing_mode TEXT NOT NULL DEFAULT 'balanced',
  court_name TEXT DEFAULT '',
  court_names TEXT DEFAULT '{}',
  session_type TEXT NOT NULL DEFAULT 'open_play',
  game_mode TEXT NOT NULL DEFAULT 'doubles',
  matching_mode TEXT NOT NULL DEFAULT 'balanced',
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
  pair_id TEXT REFERENCES fixed_pairs(id),
  queued_at TEXT NOT NULL DEFAULT ''
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

-- ============================================================
-- MLP Tournament Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_teams (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  player1_id TEXT NOT NULL REFERENCES players(id),
  player2_id TEXT NOT NULL REFERENCES players(id),
  player3_id TEXT NOT NULL REFERENCES players(id),
  player4_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tournament_teams_session
  ON tournament_teams(session_id);

CREATE TABLE IF NOT EXISTS tournament_brackets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  round INTEGER NOT NULL,
  round_name TEXT NOT NULL,
  match_index INTEGER NOT NULL,
  team_a_id TEXT REFERENCES tournament_teams(id),
  team_b_id TEXT REFERENCES tournament_teams(id),
  winner_team_id TEXT REFERENCES tournament_teams(id),
  match_id TEXT REFERENCES matches(id),
  is_bye INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tournament_brackets_session
  ON tournament_brackets(session_id);

CREATE INDEX IF NOT EXISTS idx_tournament_brackets_round
  ON tournament_brackets(session_id, round);

CREATE TABLE IF NOT EXISTS mlp_match_results (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  bracket_id TEXT NOT NULL REFERENCES tournament_brackets(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  team_a_id TEXT NOT NULL REFERENCES tournament_teams(id),
  team_b_id TEXT NOT NULL REFERENCES tournament_teams(id),
  team_a_wins INTEGER NOT NULL DEFAULT 0,
  team_b_wins INTEGER NOT NULL DEFAULT 0,
  sub_games TEXT NOT NULL DEFAULT '[]',
  winner_team_id TEXT NOT NULL REFERENCES tournament_teams(id),
  dream_breaker_played INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mlp_results_session
  ON mlp_match_results(session_id);

CREATE INDEX IF NOT EXISTS idx_mlp_results_bracket
  ON mlp_match_results(bracket_id);
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

  // Migration: Add queued_at column to queue_entries
  const hasQueuedAt = queueColumnsInfo.some((col) => col.name === 'queued_at');
  if (!hasQueuedAt) {
    db.exec("ALTER TABLE queue_entries ADD COLUMN queued_at TEXT NOT NULL DEFAULT ''");
  }

  // Migration: Add session_duration_hours column to sessions if it doesn't exist
  const sessionColumnsInfo = db.pragma('table_info(sessions)') as Array<{ name: string }>;
  const hasDurationHours = sessionColumnsInfo.some((col) => col.name === 'session_duration_hours');
  if (!hasDurationHours) {
    db.exec('ALTER TABLE sessions ADD COLUMN session_duration_hours REAL NOT NULL DEFAULT 4');
  }

  // Migration: Add mlp_config column to sessions if it doesn't exist
  const hasMlpConfig = sessionColumnsInfo.some((col) => col.name === 'mlp_config');
  if (!hasMlpConfig) {
    db.exec("ALTER TABLE sessions ADD COLUMN mlp_config TEXT DEFAULT NULL");
  }

  // Migration: Add gender column to players if it doesn't exist
  const playerColumnsInfo = db.pragma('table_info(players)') as Array<{ name: string }>;
  const hasGender = playerColumnsInfo.some((col) => col.name === 'gender');
  if (!hasGender) {
    db.exec("ALTER TABLE players ADD COLUMN gender TEXT DEFAULT NULL");
  }

  // Add score columns to mlp_match_results for point differential tracking
  const mlpColumnsInfo = db.pragma('table_info(mlp_match_results)') as Array<{ name: string }>;
  const hasTotalScoreA = mlpColumnsInfo.some((col) => col.name === 'total_score_a');
  if (!hasTotalScoreA) {
    db.exec("ALTER TABLE mlp_match_results ADD COLUMN total_score_a INTEGER NOT NULL DEFAULT 0");
  }
  const hasTotalScoreB = mlpColumnsInfo.some((col) => col.name === 'total_score_b');
  if (!hasTotalScoreB) {
    db.exec("ALTER TABLE mlp_match_results ADD COLUMN total_score_b INTEGER NOT NULL DEFAULT 0");
  }

  // Migration: Add last_match_result column to player_ratings for comeback mode
  const ratingColumnsInfo = db.pragma('table_info(player_ratings)') as Array<{ name: string }>;
  const hasLastResult = ratingColumnsInfo.some((col) => col.name === 'last_match_result');
  if (!hasLastResult) {
    db.exec("ALTER TABLE player_ratings ADD COLUMN last_match_result TEXT DEFAULT NULL");
  }

  // Migration: Add assigned_bracket column to matches for comeback mode labels
  const matchColumnsInfo = db.pragma('table_info(matches)') as Array<{ name: string }>;
  const hasAssignedBracket = matchColumnsInfo.some((col) => col.name === 'assigned_bracket');
  if (!hasAssignedBracket) {
    db.exec("ALTER TABLE matches ADD COLUMN assigned_bracket TEXT DEFAULT NULL");
  }

  // Migration: Add club_raid_config column to sessions for Club Raid mode
  const hasClubRaidConfig = sessionColumnsInfo.some((col) => col.name === 'club_raid_config');
  if (!hasClubRaidConfig) {
    db.exec("ALTER TABLE sessions ADD COLUMN club_raid_config TEXT DEFAULT NULL");
  }

  // Create clubs table for Club Raid mode
  db.exec(`
    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      created_at TEXT NOT NULL
    )
  `);

  // Create club_members table for Club Raid mode
  db.exec(`
    CREATE TABLE IF NOT EXISTS club_members (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL
    )
  `);

  // Create unique index on club_members to prevent duplicate assignments
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_club_members_player
    ON club_members(club_id, player_id)
  `);

  // Create club_raid_matches table for round-robin schedule
  db.exec(`
    CREATE TABLE IF NOT EXISTS club_raid_matches (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      club_a_id TEXT NOT NULL REFERENCES clubs(id),
      club_b_id TEXT NOT NULL REFERENCES clubs(id),
      match_id TEXT REFERENCES matches(id),
      status TEXT NOT NULL DEFAULT 'scheduled',
      winner_club_id TEXT REFERENCES clubs(id),
      created_at TEXT NOT NULL
    )
  `);

  // Create index on club_raid_matches for fast lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_club_raid_matches_session
    ON club_raid_matches(session_id, round)
  `);

  // Migration: Add player assignment columns to club_raid_matches
  const cramColumnsInfo = db.pragma('table_info(club_raid_matches)') as Array<{ name: string }>;
  for (const col of ['club_a_player_1', 'club_a_player_2', 'club_b_player_1', 'club_b_player_2']) {
    if (!cramColumnsInfo.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE club_raid_matches ADD COLUMN ${col} TEXT DEFAULT NULL REFERENCES players(id)`);
    }
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

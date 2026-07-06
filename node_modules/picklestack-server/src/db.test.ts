import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { getDb, closeDb } from './db';
import fs from 'fs';
import path from 'path';

describe('Database initialization', () => {
  const dataDir = path.resolve(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'picklestack.db');

  beforeEach(() => {
    closeDb();
    // Clean up any existing test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    // Also remove WAL/SHM files if they exist
    if (fs.existsSync(dbPath + '-wal')) {
      fs.unlinkSync(dbPath + '-wal');
    }
    if (fs.existsSync(dbPath + '-shm')) {
      fs.unlinkSync(dbPath + '-shm');
    }
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    if (fs.existsSync(dbPath + '-wal')) {
      fs.unlinkSync(dbPath + '-wal');
    }
    if (fs.existsSync(dbPath + '-shm')) {
      fs.unlinkSync(dbPath + '-shm');
    }
  });

  it('should create the database file on first call', () => {
    const db = getDb();
    expect(db).toBeDefined();
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('should return the same instance on subsequent calls', () => {
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it('should enable WAL journal mode', () => {
    const db = getDb();
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe('wal');
  });

  it('should enable foreign keys', () => {
    const db = getDb();
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });

  it('should create the sessions table', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('should create the players table', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='players'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('should create the queue_entries table', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='queue_entries'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('should create the matches table', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='matches'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('should create the unique index on active courts', () => {
    const db = getDb();
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_active_court'"
    ).all();
    expect(indexes).toHaveLength(1);
  });

  it('should create the match_results table', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='match_results'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('should create the player_ratings table', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='player_ratings'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('should create the pairing_history table', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pairing_history'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('should include pairing_mode column in sessions table with default smart', () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO sessions (id, name, court_count, status, live_view_url, created_at, updated_at)
      VALUES ('s_pm', 'Test', 4, 'active', '/live/s_pm', '2024-01-01', '2024-01-01')
    `).run();
    const session = db.prepare("SELECT pairing_mode FROM sessions WHERE id = 's_pm'").get() as { pairing_mode: string };
    expect(session.pairing_mode).toBe('smart');
  });

  it('should enforce unique active court constraint', () => {
    const db = getDb();

    // Insert a session first
    db.prepare(`
      INSERT INTO sessions (id, name, court_count, status, live_view_url, created_at, updated_at)
      VALUES ('s1', 'Test Session', 4, 'active', '/live/s1', '2024-01-01', '2024-01-01')
    `).run();

    // Insert first active match on court 1
    db.prepare(`
      INSERT INTO matches (id, session_id, court_number, player_ids, status, started_at)
      VALUES ('m1', 's1', 1, '["p1","p2","p3","p4"]', 'active', '2024-01-01')
    `).run();

    // Attempt to insert second active match on same court should fail
    expect(() => {
      db.prepare(`
        INSERT INTO matches (id, session_id, court_number, player_ids, status, started_at)
        VALUES ('m2', 's1', 1, '["p5","p6","p7","p8"]', 'active', '2024-01-01')
      `).run();
    }).toThrow();
  });

  it('should allow completed matches on the same court', () => {
    const db = getDb();

    // Insert a session
    db.prepare(`
      INSERT INTO sessions (id, name, court_count, status, live_view_url, created_at, updated_at)
      VALUES ('s1', 'Test Session', 4, 'active', '/live/s1', '2024-01-01', '2024-01-01')
    `).run();

    // Insert a completed match on court 1
    db.prepare(`
      INSERT INTO matches (id, session_id, court_number, player_ids, status, started_at, completed_at)
      VALUES ('m1', 's1', 1, '["p1","p2","p3","p4"]', 'completed', '2024-01-01', '2024-01-01')
    `).run();

    // Insert an active match on the same court should succeed
    db.prepare(`
      INSERT INTO matches (id, session_id, court_number, player_ids, status, started_at)
      VALUES ('m2', 's1', 1, '["p5","p6","p7","p8"]', 'active', '2024-01-01')
    `).run();

    const matches = db.prepare("SELECT * FROM matches WHERE session_id = 's1'").all();
    expect(matches).toHaveLength(2);
  });
});

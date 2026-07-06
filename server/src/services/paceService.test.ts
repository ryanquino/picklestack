import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computePaceMetrics } from './paceService';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'picklestack.db');

function cleanupDb() {
  closeDb();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
  if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
}

// Helper to create a session with configurable created_at
function insertSession(
  id: string,
  options: {
    courtCount?: number;
    gameMode?: string;
    createdAt?: string;
  } = {}
) {
  const { courtCount = 4, gameMode = 'doubles', createdAt = new Date().toISOString() } = options;
  return repo.createSession({
    id,
    name: 'Test Session',
    court_count: courtCount,
    status: 'active',
    pairing_mode: 'smart',
    court_name: '',
    session_type: 'open_play',
    game_mode: gameMode,
    matching_mode: 'smart',
    live_view_url: `/live/${id}`,
    created_at: createdAt,
    updated_at: createdAt,
  });
}

// Helper to create a player
function insertPlayer(sessionId: string, name: string): string {
  const id = uuidv4();
  repo.createPlayer({
    id,
    session_id: sessionId,
    name,
    checked_in_at: new Date().toISOString(),
  });
  return id;
}

// Helper to create a completed match with specific start/end times
function insertCompletedMatch(
  sessionId: string,
  playerIds: string[],
  startedAt: string,
  completedAt: string
): string {
  const id = uuidv4();
  repo.createMatch({
    id,
    session_id: sessionId,
    court_number: 1,
    player_ids: JSON.stringify(playerIds),
    status: 'completed',
    started_at: startedAt,
    completed_at: completedAt,
  });
  return id;
}

describe('paceService', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  describe('computePaceMetrics', () => {
    it('returns "Session not found" for non-existent session', () => {
      const result = computePaceMetrics('nonexistent');
      expect(result.displayMessage).toBe('Session not found');
      expect(result.averageMatchDurationSeconds).toBeNull();
      expect(result.pacingProjection).toBeNull();
    });

    it('returns "No players checked in" when session has zero players', () => {
      const sessionId = uuidv4();
      insertSession(sessionId);

      const result = computePaceMetrics(sessionId);
      expect(result.displayMessage).toBe('No players checked in');
      expect(result.averageMatchDurationSeconds).toBeNull();
      expect(result.pacingProjection).toBeNull();
      expect(result.warningMessage).toBeNull();
    });

    it('returns "Not enough data yet" when fewer than 2 matches completed', () => {
      const sessionId = uuidv4();
      insertSession(sessionId);
      const p1 = insertPlayer(sessionId, 'Alice');
      const p2 = insertPlayer(sessionId, 'Bob');
      const p3 = insertPlayer(sessionId, 'Charlie');
      const p4 = insertPlayer(sessionId, 'Diana');

      // Only 1 completed match
      const start = new Date('2024-06-01T10:00:00Z').toISOString();
      const end = new Date('2024-06-01T10:10:00Z').toISOString();
      insertCompletedMatch(sessionId, [p1, p2, p3, p4], start, end);

      const result = computePaceMetrics(sessionId);
      expect(result.displayMessage).toBe('Not enough data yet');
      expect(result.averageMatchDurationSeconds).toBeNull();
      expect(result.pacingProjection).toBeNull();
    });

    it('computes correct average duration and projection for a typical session', () => {
      const sessionId = uuidv4();
      // Session created 60 minutes ago → 180 minutes remaining
      const createdAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      insertSession(sessionId, { courtCount: 4, gameMode: 'doubles', createdAt });

      // 8 players checked in
      const players: string[] = [];
      for (let i = 0; i < 8; i++) {
        players.push(insertPlayer(sessionId, `Player${i}`));
      }

      // 2 completed matches, each 10 minutes long
      const match1Start = new Date(Date.now() - 50 * 60 * 1000).toISOString();
      const match1End = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      insertCompletedMatch(sessionId, players.slice(0, 4), match1Start, match1End);

      const match2Start = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      const match2End = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      insertCompletedMatch(sessionId, players.slice(4, 8), match2Start, match2End);

      const result = computePaceMetrics(sessionId);

      // Average duration = 10 minutes = 600 seconds
      expect(result.averageMatchDurationSeconds).toBe(600);

      // Projection = 180 / 10 × 4 / ceil(8/4) = 18 * 4 / 2 = 36
      expect(result.pacingProjection).toBe(36);
      expect(result.warningMessage).toBeNull();
      expect(result.displayMessage).toBe('At current pace, each player will get ~36 games');
    });

    it('shows warning when projection is below 6 games per player', () => {
      const sessionId = uuidv4();
      // Session created 200 minutes ago → 40 minutes remaining
      const createdAt = new Date(Date.now() - 200 * 60 * 1000).toISOString();
      insertSession(sessionId, { courtCount: 2, gameMode: 'doubles', createdAt });

      // 16 players
      const players: string[] = [];
      for (let i = 0; i < 16; i++) {
        players.push(insertPlayer(sessionId, `Player${i}`));
      }

      // 2 completed matches, each 15 minutes long
      const match1Start = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const match1End = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      insertCompletedMatch(sessionId, players.slice(0, 4), match1Start, match1End);

      const match2Start = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const match2End = new Date(Date.now()).toISOString();
      insertCompletedMatch(sessionId, players.slice(4, 8), match2Start, match2End);

      const result = computePaceMetrics(sessionId);

      // Avg duration = 15 min
      // Projection = 40/15 * 2 / ceil(16/4) = 2.667 * 2 / 4 = 1.333 → rounds to 1
      expect(result.pacingProjection).toBeLessThan(6);
      expect(result.warningMessage).toContain('⚠️ Games are running long');
      expect(result.warningMessage).toContain(`${result.pacingProjection} games`);
    });

    it('returns projection 0 and warning when remaining time is zero or negative', () => {
      const sessionId = uuidv4();
      // Session created 250 minutes ago → remaining time is negative
      const createdAt = new Date(Date.now() - 250 * 60 * 1000).toISOString();
      insertSession(sessionId, { courtCount: 4, gameMode: 'doubles', createdAt });

      const players: string[] = [];
      for (let i = 0; i < 8; i++) {
        players.push(insertPlayer(sessionId, `Player${i}`));
      }

      // 2 completed matches
      const match1Start = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const match1End = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      insertCompletedMatch(sessionId, players.slice(0, 4), match1Start, match1End);

      const match2Start = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const match2End = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      insertCompletedMatch(sessionId, players.slice(4, 8), match2Start, match2End);

      const result = computePaceMetrics(sessionId);

      expect(result.pacingProjection).toBe(0);
      expect(result.remainingMinutes).toBe(0);
      expect(result.warningMessage).toBe('⚠️ Session time has expired.');
    });

    it('handles singles mode (2 players per match)', () => {
      const sessionId = uuidv4();
      // Session created 60 minutes ago → 180 minutes remaining
      const createdAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      insertSession(sessionId, { courtCount: 2, gameMode: 'singles', createdAt });

      // 6 players
      const players: string[] = [];
      for (let i = 0; i < 6; i++) {
        players.push(insertPlayer(sessionId, `Player${i}`));
      }

      // 2 completed matches, each 12 minutes
      const match1Start = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      const match1End = new Date(Date.now() - 28 * 60 * 1000).toISOString();
      insertCompletedMatch(sessionId, [players[0], players[1]], match1Start, match1End);

      const match2Start = new Date(Date.now() - 28 * 60 * 1000).toISOString();
      const match2End = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      insertCompletedMatch(sessionId, [players[2], players[3]], match2Start, match2End);

      const result = computePaceMetrics(sessionId);

      // Avg duration = 12 min = 720 seconds
      expect(result.averageMatchDurationSeconds).toBe(720);

      // Projection = 180/12 * 2 / ceil(6/2) = 15 * 2 / 3 = 10
      expect(result.pacingProjection).toBe(10);
      expect(result.warningMessage).toBeNull();
    });

    it('returns 0 matches scenario: no completed matches', () => {
      const sessionId = uuidv4();
      insertSession(sessionId);
      insertPlayer(sessionId, 'Alice');
      insertPlayer(sessionId, 'Bob');

      const result = computePaceMetrics(sessionId);
      expect(result.displayMessage).toBe('Not enough data yet');
    });
  });
});

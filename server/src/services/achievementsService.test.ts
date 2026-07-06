import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import * as repo from '../repository';
import { AchievementKind } from '../types';
import {
  evaluateAchievements,
  getPlayerAchievements,
  getSessionAchievementsAll,
} from './achievementsService';
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

// Helper to create a session
function insertSession(id = 's1', courtCount = 4) {
  return repo.createSession({
    id,
    name: 'Test Session',
    court_count: courtCount,
    status: 'active',
    pairing_mode: 'smart',
    court_name: '',
    session_type: 'open_play',
    game_mode: 'doubles',
    matching_mode: 'smart',
    live_view_url: `/live/${id}`,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
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

// Helper to create a match (completed)
function insertMatch(sessionId: string, playerIds: string[]): string {
  const id = uuidv4();
  repo.createMatch({
    id,
    session_id: sessionId,
    court_number: 1,
    player_ids: JSON.stringify(playerIds),
    status: 'completed',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  return id;
}

// Helper to create a match result
function insertMatchResult(
  sessionId: string,
  matchId: string,
  winnerIds: [string, string],
  loserIds: [string, string],
  recordedAt?: string
): void {
  repo.createMatchResult({
    id: uuidv4(),
    match_id: matchId,
    session_id: sessionId,
    winner_player_ids: JSON.stringify(winnerIds),
    loser_player_ids: JSON.stringify(loserIds),
    team1_score: null,
    team2_score: null,
    recorded_at: recordedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// Helper to set up a player rating
function insertPlayerRating(
  sessionId: string,
  playerId: string,
  opts: { matchesPlayed?: number; wins?: number; losses?: number; rating?: number } = {}
): void {
  repo.upsertPlayerRating({
    player_id: playerId,
    session_id: sessionId,
    rating: opts.rating ?? 1000,
    matches_played: opts.matchesPlayed ?? 0,
    wins: opts.wins ?? 0,
    losses: opts.losses ?? 0,
    star_rating: 3,
  });
}

// Helper to set up pairing history (teammates)
function insertTeammateHistory(
  sessionId: string,
  player1Id: string,
  player2Id: string,
  count: number
): void {
  // Ensure consistent ordering
  const [p1, p2] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id];
  repo.upsertPairingHistory({
    session_id: sessionId,
    player1_id: p1,
    player2_id: p2,
    times_as_teammates: count,
    times_as_opponents: 0,
  });
}

// ============================================================
// Iron Player Achievement
// ============================================================

describe('AchievementsService - Iron Player', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * Validates: Requirements 12.1
   * Iron Player — awarded to the Player who has played the most matches (minimum 5).
   */
  it('should award Iron Player to player with 5+ matches played', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    // Give Alice 5 matches played
    insertPlayerRating('s1', p1, { matchesPlayed: 5, wins: 3, losses: 2 });
    insertPlayerRating('s1', p2, { matchesPlayed: 3, wins: 1, losses: 2 });
    insertPlayerRating('s1', p3, { matchesPlayed: 3, wins: 2, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 3, wins: 2, losses: 1 });

    // Create a match and result to trigger evaluation
    const matchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId, [p1, p2], [p3, p4]);

    evaluateAchievements('s1', matchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements).toHaveLength(1);
    expect(achievements[0].kind).toBe(AchievementKind.IronPlayer);
  });

  it('should not award Iron Player when no player has 5 matches', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 4, wins: 2, losses: 2 });
    insertPlayerRating('s1', p2, { matchesPlayed: 3, wins: 1, losses: 2 });
    insertPlayerRating('s1', p3, { matchesPlayed: 3, wins: 2, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 3, wins: 2, losses: 1 });

    const matchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId, [p1, p2], [p3, p4]);

    evaluateAchievements('s1', matchId);

    const allAchievements = getSessionAchievementsAll('s1');
    const ironPlayer = allAchievements.filter((a) => a.kind === AchievementKind.IronPlayer);
    expect(ironPlayer).toHaveLength(0);
  });

  /**
   * Validates: Requirements 12.6
   * Iron Player SHALL be re-evaluated after each match and may transfer.
   */
  it('should transfer Iron Player when another player surpasses match count', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    // Alice has 5 matches - gets Iron Player first
    insertPlayerRating('s1', p1, { matchesPlayed: 5, wins: 3, losses: 2 });
    insertPlayerRating('s1', p2, { matchesPlayed: 4, wins: 2, losses: 2 });
    insertPlayerRating('s1', p3, { matchesPlayed: 3, wins: 2, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 3, wins: 2, losses: 1 });

    // First match triggers evaluation - Alice gets Iron Player
    const matchId1 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId1, [p1, p2], [p3, p4]);
    evaluateAchievements('s1', matchId1);

    // Verify Alice has Iron Player
    let aliceAchievements = getPlayerAchievements('s1', p1);
    expect(aliceAchievements.some((a) => a.kind === AchievementKind.IronPlayer)).toBe(true);

    // Now Bob surpasses Alice with 6 matches
    repo.updatePlayerRatingValues(p2, 's1', {
      rating: 1000,
      matches_played: 6,
      wins: 3,
      losses: 3,
      star_rating: 3,
    });

    // Second match triggers re-evaluation
    const matchId2 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId2, [p2, p3], [p1, p4]);
    evaluateAchievements('s1', matchId2);

    // Iron Player should transfer to Bob
    const bobAchievements = getPlayerAchievements('s1', p2);
    expect(bobAchievements.some((a) => a.kind === AchievementKind.IronPlayer)).toBe(true);

    // Alice should no longer have Iron Player
    aliceAchievements = getPlayerAchievements('s1', p1);
    expect(aliceAchievements.some((a) => a.kind === AchievementKind.IronPlayer)).toBe(false);
  });

  it('should not transfer Iron Player when same player still leads', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 6, wins: 4, losses: 2 });
    insertPlayerRating('s1', p2, { matchesPlayed: 5, wins: 3, losses: 2 });
    insertPlayerRating('s1', p3, { matchesPlayed: 3, wins: 2, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 3, wins: 2, losses: 1 });

    const matchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId, [p1, p2], [p3, p4]);
    evaluateAchievements('s1', matchId);

    // Alice should still have Iron Player
    const aliceAchievements = getPlayerAchievements('s1', p1);
    expect(aliceAchievements.some((a) => a.kind === AchievementKind.IronPlayer)).toBe(true);

    // Evaluate again - should not duplicate
    evaluateAchievements('s1', matchId);
    const allAchievements = getSessionAchievementsAll('s1');
    const ironPlayers = allAchievements.filter((a) => a.kind === AchievementKind.IronPlayer);
    expect(ironPlayers).toHaveLength(1);
  });
});


// ============================================================
// Undefeated Achievement
// ============================================================

describe('AchievementsService - Undefeated', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * Validates: Requirements 12.1
   * Undefeated — awarded to any Player who has won all matches and played at least 3.
   */
  it('should award Undefeated to player with 3+ wins and 0 losses', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    // Alice has 3 wins, 0 losses
    insertPlayerRating('s1', p1, { matchesPlayed: 3, wins: 3, losses: 0 });
    insertPlayerRating('s1', p2, { matchesPlayed: 3, wins: 1, losses: 2 });
    insertPlayerRating('s1', p3, { matchesPlayed: 3, wins: 1, losses: 2 });
    insertPlayerRating('s1', p4, { matchesPlayed: 3, wins: 1, losses: 2 });

    const matchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId, [p1, p2], [p3, p4]);
    evaluateAchievements('s1', matchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.Undefeated)).toBe(true);
  });

  it('should not award Undefeated to player with fewer than 3 matches', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    // Alice has 2 wins, 0 losses (not enough matches)
    insertPlayerRating('s1', p1, { matchesPlayed: 2, wins: 2, losses: 0 });
    insertPlayerRating('s1', p2, { matchesPlayed: 2, wins: 0, losses: 2 });
    insertPlayerRating('s1', p3, { matchesPlayed: 2, wins: 1, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 2, wins: 1, losses: 1 });

    const matchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId, [p1, p2], [p3, p4]);
    evaluateAchievements('s1', matchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.Undefeated)).toBe(false);
  });

  it('should not award Undefeated to player with any losses', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    // Alice has 4 wins, 1 loss
    insertPlayerRating('s1', p1, { matchesPlayed: 5, wins: 4, losses: 1 });
    insertPlayerRating('s1', p2, { matchesPlayed: 5, wins: 2, losses: 3 });
    insertPlayerRating('s1', p3, { matchesPlayed: 5, wins: 2, losses: 3 });
    insertPlayerRating('s1', p4, { matchesPlayed: 5, wins: 2, losses: 3 });

    const matchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId, [p1, p2], [p3, p4]);
    evaluateAchievements('s1', matchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.Undefeated)).toBe(false);
  });
});

// ============================================================
// Hot Streak Achievement
// ============================================================

describe('AchievementsService - Hot Streak', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * Validates: Requirements 12.1
   * Hot Streak — awarded to any Player who achieves 5+ consecutive wins.
   */
  it('should award Hot Streak to player with 5 consecutive wins', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 5, wins: 5, losses: 0 });
    insertPlayerRating('s1', p2, { matchesPlayed: 5, wins: 3, losses: 2 });
    insertPlayerRating('s1', p3, { matchesPlayed: 5, wins: 1, losses: 4 });
    insertPlayerRating('s1', p4, { matchesPlayed: 5, wins: 1, losses: 4 });

    // Create 5 match results where Alice wins all (chronological order)
    for (let i = 0; i < 5; i++) {
      const matchId = insertMatch('s1', [p1, p2, p3, p4]);
      insertMatchResult('s1', matchId, [p1, p2], [p3, p4], `2024-01-01T0${i}:00:00.000Z`);
    }

    // Evaluate on the last match
    const lastMatchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', lastMatchId, [p1, p2], [p3, p4], '2024-01-01T05:00:00.000Z');
    evaluateAchievements('s1', lastMatchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.HotStreak)).toBe(true);
  });

  it('should not award Hot Streak with only 4 consecutive wins', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 5, wins: 4, losses: 1 });
    insertPlayerRating('s1', p2, { matchesPlayed: 5, wins: 3, losses: 2 });
    insertPlayerRating('s1', p3, { matchesPlayed: 5, wins: 1, losses: 4 });
    insertPlayerRating('s1', p4, { matchesPlayed: 5, wins: 2, losses: 3 });

    // Alice loses first match, then wins 4 in a row (current streak = 4)
    const matchId0 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', matchId0, [p3, p4], [p1, p2], '2024-01-01T00:00:00.000Z');

    for (let i = 1; i <= 3; i++) {
      const matchId = insertMatch('s1', [p1, p2, p3, p4]);
      insertMatchResult('s1', matchId, [p1, p2], [p3, p4], `2024-01-01T0${i}:00:00.000Z`);
    }

    // The 4th win is the match we evaluate on
    const lastMatchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', lastMatchId, [p1, p2], [p3, p4], '2024-01-01T04:00:00.000Z');
    evaluateAchievements('s1', lastMatchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.HotStreak)).toBe(false);
  });

  it('should not award Hot Streak when streak is broken by a loss', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 6, wins: 5, losses: 1 });
    insertPlayerRating('s1', p2, { matchesPlayed: 6, wins: 3, losses: 3 });
    insertPlayerRating('s1', p3, { matchesPlayed: 6, wins: 1, losses: 5 });
    insertPlayerRating('s1', p4, { matchesPlayed: 6, wins: 1, losses: 5 });

    // Alice wins 3, loses 1, wins 2 (no 5-streak)
    for (let i = 0; i < 3; i++) {
      const matchId = insertMatch('s1', [p1, p2, p3, p4]);
      insertMatchResult('s1', matchId, [p1, p2], [p3, p4], `2024-01-01T0${i}:00:00.000Z`);
    }
    const lossMatch = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', lossMatch, [p3, p4], [p1, p2], '2024-01-01T03:00:00.000Z');
    for (let i = 4; i < 6; i++) {
      const matchId = insertMatch('s1', [p1, p2, p3, p4]);
      insertMatchResult('s1', matchId, [p1, p2], [p3, p4], `2024-01-01T0${i}:00:00.000Z`);
    }

    const lastMatchId = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', lastMatchId, [p1, p2], [p3, p4], '2024-01-01T06:00:00.000Z');
    evaluateAchievements('s1', lastMatchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.HotStreak)).toBe(false);
  });
});


// ============================================================
// Comeback King Achievement
// ============================================================

describe('AchievementsService - Comeback King', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * Validates: Requirements 12.1, 12.2
   * Comeback King — awarded to any Player who wins after losing 2+ consecutive matches.
   * Evaluated after each Match_Result is recorded.
   */
  it('should award Comeback King after 2 losses then a win', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 3, wins: 1, losses: 2 });
    insertPlayerRating('s1', p2, { matchesPlayed: 3, wins: 2, losses: 1 });
    insertPlayerRating('s1', p3, { matchesPlayed: 3, wins: 2, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 3, wins: 1, losses: 2 });

    // Alice loses 2 matches, then wins 1
    const match1 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', match1, [p3, p4], [p1, p2], '2024-01-01T00:00:00.000Z');

    const match2 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', match2, [p3, p4], [p1, p2], '2024-01-01T01:00:00.000Z');

    const match3 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', match3, [p1, p2], [p3, p4], '2024-01-01T02:00:00.000Z');

    evaluateAchievements('s1', match3);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.ComebackKing)).toBe(true);
  });

  it('should award Comeback King after 3+ losses then a win', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 4, wins: 1, losses: 3 });
    insertPlayerRating('s1', p2, { matchesPlayed: 4, wins: 3, losses: 1 });
    insertPlayerRating('s1', p3, { matchesPlayed: 4, wins: 3, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 4, wins: 1, losses: 3 });

    // Alice loses 3 matches, then wins 1
    for (let i = 0; i < 3; i++) {
      const matchId = insertMatch('s1', [p1, p2, p3, p4]);
      insertMatchResult('s1', matchId, [p3, p4], [p1, p2], `2024-01-01T0${i}:00:00.000Z`);
    }

    const winMatch = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', winMatch, [p1, p2], [p3, p4], '2024-01-01T03:00:00.000Z');

    evaluateAchievements('s1', winMatch);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.ComebackKing)).toBe(true);
  });

  it('should not award Comeback King with only 1 loss before a win', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 2, wins: 1, losses: 1 });
    insertPlayerRating('s1', p2, { matchesPlayed: 2, wins: 1, losses: 1 });
    insertPlayerRating('s1', p3, { matchesPlayed: 2, wins: 1, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 2, wins: 1, losses: 1 });

    // Alice loses 1 match, then wins 1
    const match1 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', match1, [p3, p4], [p1, p2], '2024-01-01T00:00:00.000Z');

    const match2 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', match2, [p1, p2], [p3, p4], '2024-01-01T01:00:00.000Z');

    evaluateAchievements('s1', match2);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.ComebackKing)).toBe(false);
  });

  it('should not award Comeback King when most recent result is a loss', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    insertPlayerRating('s1', p1, { matchesPlayed: 3, wins: 1, losses: 2 });
    insertPlayerRating('s1', p2, { matchesPlayed: 3, wins: 2, losses: 1 });
    insertPlayerRating('s1', p3, { matchesPlayed: 3, wins: 2, losses: 1 });
    insertPlayerRating('s1', p4, { matchesPlayed: 3, wins: 1, losses: 2 });

    // Alice wins, then loses 2 (not a comeback)
    const match1 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', match1, [p1, p2], [p3, p4], '2024-01-01T00:00:00.000Z');

    const match2 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', match2, [p3, p4], [p1, p2], '2024-01-01T01:00:00.000Z');

    const match3 = insertMatch('s1', [p1, p2, p3, p4]);
    insertMatchResult('s1', match3, [p3, p4], [p1, p2], '2024-01-01T02:00:00.000Z');

    evaluateAchievements('s1', match3);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.ComebackKing)).toBe(false);
  });
});

// ============================================================
// Social Butterfly Achievement
// ============================================================

describe('AchievementsService - Social Butterfly', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * Validates: Requirements 12.1
   * Social Butterfly — awarded to any Player who has been teammates with 6+ different Players.
   */
  it('should award Social Butterfly to player with 6+ distinct teammates', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const teammates: string[] = [];
    for (let i = 0; i < 6; i++) {
      teammates.push(insertPlayer('s1', `Teammate${i + 1}`));
    }
    const p3 = insertPlayer('s1', 'Opponent1');
    const p4 = insertPlayer('s1', 'Opponent2');

    // Set up player ratings
    insertPlayerRating('s1', p1, { matchesPlayed: 6, wins: 3, losses: 3 });
    for (const t of teammates) {
      insertPlayerRating('s1', t, { matchesPlayed: 1, wins: 1, losses: 0 });
    }
    insertPlayerRating('s1', p3, { matchesPlayed: 6, wins: 3, losses: 3 });
    insertPlayerRating('s1', p4, { matchesPlayed: 6, wins: 3, losses: 3 });

    // Set up pairing history: Alice has been teammates with 6 different players
    for (const t of teammates) {
      insertTeammateHistory('s1', p1, t, 1);
    }

    // Create a match to trigger evaluation
    const matchId = insertMatch('s1', [p1, teammates[0], p3, p4]);
    insertMatchResult('s1', matchId, [p1, teammates[0]], [p3, p4]);
    evaluateAchievements('s1', matchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.SocialButterfly)).toBe(true);
  });

  it('should not award Social Butterfly with fewer than 6 distinct teammates', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const teammates: string[] = [];
    for (let i = 0; i < 5; i++) {
      teammates.push(insertPlayer('s1', `Teammate${i + 1}`));
    }
    const p3 = insertPlayer('s1', 'Opponent1');
    const p4 = insertPlayer('s1', 'Opponent2');

    insertPlayerRating('s1', p1, { matchesPlayed: 5, wins: 3, losses: 2 });
    for (const t of teammates) {
      insertPlayerRating('s1', t, { matchesPlayed: 1, wins: 1, losses: 0 });
    }
    insertPlayerRating('s1', p3, { matchesPlayed: 5, wins: 2, losses: 3 });
    insertPlayerRating('s1', p4, { matchesPlayed: 5, wins: 2, losses: 3 });

    // Only 5 distinct teammates
    for (const t of teammates) {
      insertTeammateHistory('s1', p1, t, 1);
    }

    const matchId = insertMatch('s1', [p1, teammates[0], p3, p4]);
    insertMatchResult('s1', matchId, [p1, teammates[0]], [p3, p4]);
    evaluateAchievements('s1', matchId);

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements.some((a) => a.kind === AchievementKind.SocialButterfly)).toBe(false);
  });
});

// ============================================================
// Query Functions
// ============================================================

describe('AchievementsService - Query Functions', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('getPlayerAchievements returns achievements for a specific player', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');
    const p3 = insertPlayer('s1', 'Carol');
    const p4 = insertPlayer('s1', 'Dave');

    // Manually award achievements
    repo.createAchievement({
      id: uuidv4(),
      player_id: p1,
      session_id: 's1',
      kind: AchievementKind.HotStreak,
      awarded_at: new Date().toISOString(),
    });
    repo.createAchievement({
      id: uuidv4(),
      player_id: p2,
      session_id: 's1',
      kind: AchievementKind.IronPlayer,
      awarded_at: new Date().toISOString(),
    });

    const aliceAchievements = getPlayerAchievements('s1', p1);
    expect(aliceAchievements).toHaveLength(1);
    expect(aliceAchievements[0].kind).toBe(AchievementKind.HotStreak);
    expect(aliceAchievements[0].playerId).toBe(p1);
    expect(aliceAchievements[0].sessionId).toBe('s1');
    expect(aliceAchievements[0].awardedAt).toBeInstanceOf(Date);
  });

  it('getSessionAchievementsAll returns all achievements for a session', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');
    const p2 = insertPlayer('s1', 'Bob');

    repo.createAchievement({
      id: uuidv4(),
      player_id: p1,
      session_id: 's1',
      kind: AchievementKind.HotStreak,
      awarded_at: new Date().toISOString(),
    });
    repo.createAchievement({
      id: uuidv4(),
      player_id: p1,
      session_id: 's1',
      kind: AchievementKind.Undefeated,
      awarded_at: new Date().toISOString(),
    });
    repo.createAchievement({
      id: uuidv4(),
      player_id: p2,
      session_id: 's1',
      kind: AchievementKind.IronPlayer,
      awarded_at: new Date().toISOString(),
    });

    const allAchievements = getSessionAchievementsAll('s1');
    expect(allAchievements).toHaveLength(3);
  });

  it('getPlayerAchievements returns empty array when player has no achievements', () => {
    insertSession('s1');
    const p1 = insertPlayer('s1', 'Alice');

    const achievements = getPlayerAchievements('s1', p1);
    expect(achievements).toHaveLength(0);
  });
});

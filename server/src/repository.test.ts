import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { getDb, closeDb } from './db';
import * as repo from './repository';
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

describe('Repository', () => {
  beforeEach(() => {
    cleanupDb();
    getDb(); // Initialize fresh database
  });

  afterEach(() => {
    cleanupDb();
  });

  // Helper to create a session for tests that need one
  function insertSession(id = 's1', name = 'Test Session') {
    return repo.createSession({
      id,
      name,
      court_count: 4,
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

  function insertPlayer(id: string, sessionId: string, name: string) {
    return repo.createPlayer({
      id,
      session_id: sessionId,
      name,
      checked_in_at: '2024-01-01T00:00:00.000Z',
    });
  }

  // ============================================================
  // Session CRUD
  // ============================================================

  describe('Sessions', () => {
    it('should create and retrieve a session', () => {
      const session = insertSession();
      const retrieved = repo.getSessionById('s1');
      expect(retrieved).toEqual({
        ...session,
        court_name: '',
        session_type: 'open_play',
        game_mode: 'doubles',
        matching_mode: 'smart',
      });
    });

    it('should return undefined for non-existent session', () => {
      const result = repo.getSessionById('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should update session status', () => {
      insertSession();
      repo.updateSession('s1', { status: 'ended', updated_at: '2024-01-02T00:00:00.000Z' });
      const updated = repo.getSessionById('s1');
      expect(updated?.status).toBe('ended');
      expect(updated?.updated_at).toBe('2024-01-02T00:00:00.000Z');
    });

    it('should update session name', () => {
      insertSession();
      repo.updateSession('s1', { name: 'New Name' });
      const updated = repo.getSessionById('s1');
      expect(updated?.name).toBe('New Name');
    });

    it('should no-op when no updates provided', () => {
      insertSession();
      repo.updateSession('s1', {});
      const session = repo.getSessionById('s1');
      expect(session?.name).toBe('Test Session');
    });
  });

  // ============================================================
  // Player CRUD
  // ============================================================

  describe('Players', () => {
    it('should create and retrieve a player', () => {
      insertSession();
      const player = insertPlayer('p1', 's1', 'Alice');
      const retrieved = repo.getPlayerById('p1');
      expect(retrieved).toEqual(player);
    });

    it('should return undefined for non-existent player', () => {
      expect(repo.getPlayerById('nonexistent')).toBeUndefined();
    });

    it('should get all players for a session', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      const players = repo.getPlayersBySession('s1');
      expect(players).toHaveLength(2);
    });

    it('should find player by name case-insensitively', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      expect(repo.findPlayerByNameCaseInsensitive('s1', 'alice')).toBeDefined();
      expect(repo.findPlayerByNameCaseInsensitive('s1', 'ALICE')).toBeDefined();
      expect(repo.findPlayerByNameCaseInsensitive('s1', 'AlIcE')).toBeDefined();
    });

    it('should return undefined when no player matches case-insensitively', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      expect(repo.findPlayerByNameCaseInsensitive('s1', 'Bob')).toBeUndefined();
    });

    it('should not find player from different session', () => {
      insertSession('s1');
      insertSession('s2', 'Session 2');
      insertPlayer('p1', 's1', 'Alice');
      expect(repo.findPlayerByNameCaseInsensitive('s2', 'Alice')).toBeUndefined();
    });

    it('should delete a player', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      repo.deletePlayer('p1');
      expect(repo.getPlayerById('p1')).toBeUndefined();
    });
  });

  // ============================================================
  // Queue Entry CRUD
  // ============================================================

  describe('Queue Entries', () => {
    it('should create and retrieve a queue entry', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      const entry = repo.createQueueEntry({ player_id: 'p1', session_id: 's1', position: 0 });
      const retrieved = repo.getQueueEntryByPlayerId('p1');
      expect(retrieved).toEqual(entry);
    });

    it('should return undefined for non-existent queue entry', () => {
      expect(repo.getQueueEntryByPlayerId('nonexistent')).toBeUndefined();
    });

    it('should get queue entries ordered by position', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's1', 'Charlie');
      repo.createQueueEntry({ player_id: 'p3', session_id: 's1', position: 2 });
      repo.createQueueEntry({ player_id: 'p1', session_id: 's1', position: 0 });
      repo.createQueueEntry({ player_id: 'p2', session_id: 's1', position: 1 });

      const queue = repo.getQueueBySession('s1');
      expect(queue).toHaveLength(3);
      expect(queue[0].player_id).toBe('p1');
      expect(queue[1].player_id).toBe('p2');
      expect(queue[2].player_id).toBe('p3');
    });

    it('should return empty array for session with no queue entries', () => {
      insertSession();
      const queue = repo.getQueueBySession('s1');
      expect(queue).toEqual([]);
    });

    it('should update queue entry position', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      repo.createQueueEntry({ player_id: 'p1', session_id: 's1', position: 0 });
      repo.updateQueueEntryPosition('p1', 5);
      const entry = repo.getQueueEntryByPlayerId('p1');
      expect(entry?.position).toBe(5);
    });

    it('should delete a queue entry', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      repo.createQueueEntry({ player_id: 'p1', session_id: 's1', position: 0 });
      repo.deleteQueueEntry('p1');
      expect(repo.getQueueEntryByPlayerId('p1')).toBeUndefined();
    });

    it('should delete all queue entries for a session', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.createQueueEntry({ player_id: 'p1', session_id: 's1', position: 0 });
      repo.createQueueEntry({ player_id: 'p2', session_id: 's1', position: 1 });
      repo.deleteQueueEntriesBySession('s1');
      const queue = repo.getQueueBySession('s1');
      expect(queue).toEqual([]);
    });
  });

  // ============================================================
  // Match CRUD
  // ============================================================

  describe('Matches', () => {
    it('should create and retrieve a match', () => {
      insertSession();
      const match = repo.createMatch({
        id: 'm1',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'active',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: null,
      });
      const retrieved = repo.getMatchById('m1');
      expect(retrieved).toEqual(match);
    });

    it('should return undefined for non-existent match', () => {
      expect(repo.getMatchById('nonexistent')).toBeUndefined();
    });

    it('should get all matches for a session', () => {
      insertSession();
      repo.createMatch({
        id: 'm1',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'active',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: null,
      });
      repo.createMatch({
        id: 'm2',
        session_id: 's1',
        court_number: 2,
        player_ids: JSON.stringify(['p5', 'p6', 'p7', 'p8']),
        status: 'completed',
        started_at: '2024-01-01T01:00:00.000Z',
        completed_at: '2024-01-01T02:00:00.000Z',
      });
      const matches = repo.getMatchesBySession('s1');
      expect(matches).toHaveLength(2);
    });

    it('should get active match by court', () => {
      insertSession();
      repo.createMatch({
        id: 'm1',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'active',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: null,
      });
      const active = repo.getActiveMatchByCourt('s1', 1);
      expect(active).toBeDefined();
      expect(active?.id).toBe('m1');
    });

    it('should return undefined when no active match on court', () => {
      insertSession();
      repo.createMatch({
        id: 'm1',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'completed',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: '2024-01-01T01:00:00.000Z',
      });
      const active = repo.getActiveMatchByCourt('s1', 1);
      expect(active).toBeUndefined();
    });

    it('should get active matches for a session', () => {
      insertSession();
      repo.createMatch({
        id: 'm1',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'active',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: null,
      });
      repo.createMatch({
        id: 'm2',
        session_id: 's1',
        court_number: 2,
        player_ids: JSON.stringify(['p5', 'p6', 'p7', 'p8']),
        status: 'completed',
        started_at: '2024-01-01T01:00:00.000Z',
        completed_at: '2024-01-01T02:00:00.000Z',
      });
      const active = repo.getActiveMatchesBySession('s1');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('m1');
    });

    it('should update match status and completed_at', () => {
      insertSession();
      repo.createMatch({
        id: 'm1',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'active',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: null,
      });
      repo.updateMatch('m1', { status: 'completed', completed_at: '2024-01-01T01:00:00.000Z' });
      const updated = repo.getMatchById('m1');
      expect(updated?.status).toBe('completed');
      expect(updated?.completed_at).toBe('2024-01-01T01:00:00.000Z');
    });

    it('should count completed matches for a session', () => {
      insertSession();
      repo.createMatch({
        id: 'm1',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'completed',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: '2024-01-01T01:00:00.000Z',
      });
      repo.createMatch({
        id: 'm2',
        session_id: 's1',
        court_number: 2,
        player_ids: JSON.stringify(['p5', 'p6', 'p7', 'p8']),
        status: 'active',
        started_at: '2024-01-01T01:00:00.000Z',
        completed_at: null,
      });
      expect(repo.getCompletedMatchCountBySession('s1')).toBe(1);
    });

    it('should return 0 completed matches for session with no matches', () => {
      insertSession();
      expect(repo.getCompletedMatchCountBySession('s1')).toBe(0);
    });
  });

  // ============================================================
  // Match Result CRUD
  // ============================================================

  describe('Match Results', () => {
    function insertMatch(id = 'm1') {
      return repo.createMatch({
        id,
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'completed',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: '2024-01-01T01:00:00.000Z',
      });
    }

    it('should create and retrieve a match result by id', () => {
      insertSession();
      insertMatch();
      const result = repo.createMatchResult({
        id: 'mr1',
        match_id: 'm1',
        session_id: 's1',
        winner_player_ids: JSON.stringify(['p1', 'p2']),
        loser_player_ids: JSON.stringify(['p3', 'p4']),
        team1_score: null,
        team2_score: null,
        recorded_at: '2024-01-01T01:00:00.000Z',
        updated_at: '2024-01-01T01:00:00.000Z',
      });
      const retrieved = repo.getMatchResultById('mr1');
      expect(retrieved).toEqual({
        ...result,
        team1_score: null,
        team2_score: null,
      });
    });

    it('should retrieve a match result by match_id', () => {
      insertSession();
      insertMatch();
      repo.createMatchResult({
        id: 'mr1',
        match_id: 'm1',
        session_id: 's1',
        winner_player_ids: JSON.stringify(['p1', 'p2']),
        loser_player_ids: JSON.stringify(['p3', 'p4']),
        team1_score: null,
        team2_score: null,
        recorded_at: '2024-01-01T01:00:00.000Z',
        updated_at: '2024-01-01T01:00:00.000Z',
      });
      const retrieved = repo.getMatchResultByMatchId('m1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('mr1');
    });

    it('should return undefined for non-existent match result', () => {
      expect(repo.getMatchResultById('nonexistent')).toBeUndefined();
      expect(repo.getMatchResultByMatchId('nonexistent')).toBeUndefined();
    });

    it('should get all match results for a session', () => {
      insertSession();
      insertMatch('m1');
      insertMatch('m2');
      repo.createMatchResult({
        id: 'mr1',
        match_id: 'm1',
        session_id: 's1',
        winner_player_ids: JSON.stringify(['p1', 'p2']),
        loser_player_ids: JSON.stringify(['p3', 'p4']),
        team1_score: null,
        team2_score: null,
        recorded_at: '2024-01-01T01:00:00.000Z',
        updated_at: '2024-01-01T01:00:00.000Z',
      });
      repo.createMatchResult({
        id: 'mr2',
        match_id: 'm2',
        session_id: 's1',
        winner_player_ids: JSON.stringify(['p3', 'p4']),
        loser_player_ids: JSON.stringify(['p1', 'p2']),
        team1_score: null,
        team2_score: null,
        recorded_at: '2024-01-01T02:00:00.000Z',
        updated_at: '2024-01-01T02:00:00.000Z',
      });
      const results = repo.getMatchResultsBySession('s1');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('mr1');
      expect(results[1].id).toBe('mr2');
    });

    it('should update a match result winner/loser', () => {
      insertSession();
      insertMatch();
      repo.createMatchResult({
        id: 'mr1',
        match_id: 'm1',
        session_id: 's1',
        winner_player_ids: JSON.stringify(['p1', 'p2']),
        loser_player_ids: JSON.stringify(['p3', 'p4']),
        team1_score: null,
        team2_score: null,
        recorded_at: '2024-01-01T01:00:00.000Z',
        updated_at: '2024-01-01T01:00:00.000Z',
      });
      repo.updateMatchResult('m1', {
        winner_player_ids: JSON.stringify(['p3', 'p4']),
        loser_player_ids: JSON.stringify(['p1', 'p2']),
        updated_at: '2024-01-01T02:00:00.000Z',
      });
      const updated = repo.getMatchResultByMatchId('m1');
      expect(updated?.winner_player_ids).toBe(JSON.stringify(['p3', 'p4']));
      expect(updated?.loser_player_ids).toBe(JSON.stringify(['p1', 'p2']));
      expect(updated?.updated_at).toBe('2024-01-01T02:00:00.000Z');
    });

    it('should delete a match result', () => {
      insertSession();
      insertMatch();
      repo.createMatchResult({
        id: 'mr1',
        match_id: 'm1',
        session_id: 's1',
        winner_player_ids: JSON.stringify(['p1', 'p2']),
        loser_player_ids: JSON.stringify(['p3', 'p4']),
        team1_score: null,
        team2_score: null,
        recorded_at: '2024-01-01T01:00:00.000Z',
        updated_at: '2024-01-01T01:00:00.000Z',
      });
      repo.deleteMatchResult('m1');
      expect(repo.getMatchResultByMatchId('m1')).toBeUndefined();
    });
  });

  // ============================================================
  // Player Rating CRUD
  // ============================================================

  describe('Player Ratings', () => {
    it('should upsert a new player rating', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      const rating = repo.upsertPlayerRating({
        player_id: 'p1',
        session_id: 's1',
        rating: 1000,
        matches_played: 0,
        wins: 0,
        losses: 0,
        star_rating: 3,
      });
      const retrieved = repo.getPlayerRating('p1', 's1');
      expect(retrieved).toEqual(rating);
    });

    it('should update existing player rating on upsert', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      repo.upsertPlayerRating({
        player_id: 'p1',
        session_id: 's1',
        rating: 1000,
        matches_played: 0,
        wins: 0,
        losses: 0,
        star_rating: 3,
      });
      repo.upsertPlayerRating({
        player_id: 'p1',
        session_id: 's1',
        rating: 1016,
        matches_played: 1,
        wins: 1,
        losses: 0,
        star_rating: 3,
      });
      const retrieved = repo.getPlayerRating('p1', 's1');
      expect(retrieved?.rating).toBe(1016);
      expect(retrieved?.matches_played).toBe(1);
      expect(retrieved?.wins).toBe(1);
    });

    it('should return undefined for non-existent player rating', () => {
      expect(repo.getPlayerRating('nonexistent', 's1')).toBeUndefined();
    });

    it('should get all player ratings for a session', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.upsertPlayerRating({
        player_id: 'p1',
        session_id: 's1',
        rating: 1016,
        matches_played: 1,
        wins: 1,
        losses: 0,
        star_rating: 3,
      });
      repo.upsertPlayerRating({
        player_id: 'p2',
        session_id: 's1',
        rating: 984,
        matches_played: 1,
        wins: 0,
        losses: 1,
        star_rating: 3,
      });
      const ratings = repo.getPlayerRatingsBySession('s1');
      expect(ratings).toHaveLength(2);
    });

    it('should update player rating values directly', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      repo.upsertPlayerRating({
        player_id: 'p1',
        session_id: 's1',
        rating: 1000,
        matches_played: 0,
        wins: 0,
        losses: 0,
        star_rating: 3,
      });
      repo.updatePlayerRatingValues('p1', 's1', {
        rating: 1032,
        matches_played: 2,
        wins: 2,
        losses: 0,
        star_rating: 3,
      });
      const retrieved = repo.getPlayerRating('p1', 's1');
      expect(retrieved?.rating).toBe(1032);
      expect(retrieved?.matches_played).toBe(2);
      expect(retrieved?.wins).toBe(2);
    });
  });

  // ============================================================
  // Pairing History CRUD
  // ============================================================

  describe('Pairing History', () => {
    it('should upsert a new pairing history entry', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      const entry = repo.upsertPairingHistory({
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        times_as_teammates: 1,
        times_as_opponents: 0,
      });
      const retrieved = repo.getPairingHistory('s1', 'p1', 'p2');
      expect(retrieved).toEqual(entry);
    });

    it('should update existing pairing history on upsert', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.upsertPairingHistory({
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        times_as_teammates: 1,
        times_as_opponents: 0,
      });
      repo.upsertPairingHistory({
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        times_as_teammates: 2,
        times_as_opponents: 1,
      });
      const retrieved = repo.getPairingHistory('s1', 'p1', 'p2');
      expect(retrieved?.times_as_teammates).toBe(2);
      expect(retrieved?.times_as_opponents).toBe(1);
    });

    it('should increment teammate count', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.incrementTeammateCount('s1', 'p1', 'p2');
      const entry = repo.getPairingHistory('s1', 'p1', 'p2');
      expect(entry?.times_as_teammates).toBe(1);
      expect(entry?.times_as_opponents).toBe(0);

      repo.incrementTeammateCount('s1', 'p1', 'p2');
      const updated = repo.getPairingHistory('s1', 'p1', 'p2');
      expect(updated?.times_as_teammates).toBe(2);
    });

    it('should increment opponent count', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.incrementOpponentCount('s1', 'p1', 'p2');
      const entry = repo.getPairingHistory('s1', 'p1', 'p2');
      expect(entry?.times_as_teammates).toBe(0);
      expect(entry?.times_as_opponents).toBe(1);

      repo.incrementOpponentCount('s1', 'p1', 'p2');
      const updated = repo.getPairingHistory('s1', 'p1', 'p2');
      expect(updated?.times_as_opponents).toBe(2);
    });

    it('should return undefined for non-existent pairing history', () => {
      expect(repo.getPairingHistory('s1', 'p1', 'p2')).toBeUndefined();
    });

    it('should get all pairing history for a session', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's1', 'Charlie');
      repo.incrementTeammateCount('s1', 'p1', 'p2');
      repo.incrementOpponentCount('s1', 'p1', 'p3');
      const history = repo.getPairingHistoryBySession('s1');
      expect(history).toHaveLength(2);
    });
  });

  // ============================================================
  // Fixed Pairs
  // ============================================================

  describe('Fixed Pairs', () => {
    it('should create and return a fixed pair', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      const pair = repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      expect(pair).toEqual({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      const retrieved = repo.getFixedPairById('fp1');
      expect(retrieved).toEqual(pair);
    });

    it('should return undefined for non-existent fixed pair', () => {
      expect(repo.getFixedPairById('nonexistent')).toBeUndefined();
    });

    it('should get all fixed pairs for a session', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's1', 'Charlie');
      insertPlayer('p4', 's1', 'Dave');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      repo.createFixedPair({
        id: 'fp2',
        session_id: 's1',
        player1_id: 'p3',
        player2_id: 'p4',
        created_at: '2024-01-01T01:00:00.000Z',
      });
      const pairs = repo.getFixedPairsBySession('s1');
      expect(pairs).toHaveLength(2);
      expect(pairs[0].id).toBe('fp1');
      expect(pairs[1].id).toBe('fp2');
    });

    it('should return empty array for session with no fixed pairs', () => {
      insertSession();
      const pairs = repo.getFixedPairsBySession('s1');
      expect(pairs).toEqual([]);
    });

    it('should get fixed pair by player1 id', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      const pair = repo.getFixedPairByPlayerId('s1', 'p1');
      expect(pair).toBeDefined();
      expect(pair?.id).toBe('fp1');
      expect(pair?.player1_id).toBe('p1');
      expect(pair?.player2_id).toBe('p2');
    });

    it('should get fixed pair by player2 id', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      const pair = repo.getFixedPairByPlayerId('s1', 'p2');
      expect(pair).toBeDefined();
      expect(pair?.id).toBe('fp1');
      expect(pair?.player1_id).toBe('p1');
      expect(pair?.player2_id).toBe('p2');
    });

    it('should return undefined when player has no fixed pair', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      const pair = repo.getFixedPairByPlayerId('s1', 'p1');
      expect(pair).toBeUndefined();
    });

    it('should not find pair from different session', () => {
      insertSession('s1');
      insertSession('s2', 'Session 2');
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      const pair = repo.getFixedPairByPlayerId('s2', 'p1');
      expect(pair).toBeUndefined();
    });

    it('should delete a fixed pair', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      repo.deleteFixedPair('fp1');
      expect(repo.getFixedPairById('fp1')).toBeUndefined();
    });

    it('should delete all fixed pairs for a session', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's1', 'Charlie');
      insertPlayer('p4', 's1', 'Dave');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      repo.createFixedPair({
        id: 'fp2',
        session_id: 's1',
        player1_id: 'p3',
        player2_id: 'p4',
        created_at: '2024-01-01T01:00:00.000Z',
      });
      repo.deleteFixedPairsBySession('s1');
      const pairs = repo.getFixedPairsBySession('s1');
      expect(pairs).toEqual([]);
    });

    it('should not delete fixed pairs from other sessions', () => {
      insertSession('s1');
      insertSession('s2', 'Session 2');
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's2', 'Charlie');
      insertPlayer('p4', 's2', 'Dave');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      repo.createFixedPair({
        id: 'fp2',
        session_id: 's2',
        player1_id: 'p3',
        player2_id: 'p4',
        created_at: '2024-01-01T01:00:00.000Z',
      });
      repo.deleteFixedPairsBySession('s1');
      expect(repo.getFixedPairById('fp1')).toBeUndefined();
      expect(repo.getFixedPairById('fp2')).toBeDefined();
    });

    it('should enforce unique index preventing duplicate player1 pairing in same session', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's1', 'Charlie');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      expect(() =>
        repo.createFixedPair({
          id: 'fp2',
          session_id: 's1',
          player1_id: 'p1',
          player2_id: 'p3',
          created_at: '2024-01-01T01:00:00.000Z',
        })
      ).toThrow();
    });

    it('should enforce unique index preventing duplicate player2 pairing in same session', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's1', 'Charlie');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      expect(() =>
        repo.createFixedPair({
          id: 'fp2',
          session_id: 's1',
          player1_id: 'p3',
          player2_id: 'p2',
          created_at: '2024-01-01T01:00:00.000Z',
        })
      ).toThrow();
    });

    it('should allow same player in pairs across different sessions', () => {
      insertSession('s1');
      insertSession('s2', 'Session 2');
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's2', 'Alice2');
      insertPlayer('p4', 's2', 'Charlie');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      // Different session, different player IDs — should succeed
      const pair2 = repo.createFixedPair({
        id: 'fp2',
        session_id: 's2',
        player1_id: 'p3',
        player2_id: 'p4',
        created_at: '2024-01-01T01:00:00.000Z',
      });
      expect(pair2).toBeDefined();
    });

    it('should get queue entry by pair_id', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      repo.createQueueEntry({ player_id: 'p1', session_id: 's1', position: 0, pair_id: 'fp1' });
      const entry = repo.getQueueEntryByPairId('fp1');
      expect(entry).toBeDefined();
      expect(entry?.player_id).toBe('p1');
      expect(entry?.pair_id).toBe('fp1');
    });

    it('should return undefined for non-existent pair_id in queue', () => {
      const entry = repo.getQueueEntryByPairId('nonexistent');
      expect(entry).toBeUndefined();
    });

    it('should create queue entry with pair_id', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      repo.createFixedPair({
        id: 'fp1',
        session_id: 's1',
        player1_id: 'p1',
        player2_id: 'p2',
        created_at: '2024-01-01T00:00:00.000Z',
      });
      const entry = repo.createQueueEntry({ player_id: 'p1', session_id: 's1', position: 0, pair_id: 'fp1' });
      expect(entry.pair_id).toBe('fp1');
      const retrieved = repo.getQueueEntryByPlayerId('p1');
      expect(retrieved?.pair_id).toBe('fp1');
    });

    it('should create queue entry without pair_id (defaults to null)', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      const entry = repo.createQueueEntry({ player_id: 'p1', session_id: 's1', position: 0 });
      expect(entry.pair_id).toBeNull();
    });
  });

  // ============================================================
  // Session Pairing Mode
  // ============================================================

  describe('Session Pairing Mode', () => {
    it('should update session pairing mode', () => {
      insertSession();
      repo.updateSessionPairingMode('s1', 'queue', '2024-01-02T00:00:00.000Z');
      const session = repo.getSessionById('s1');
      expect(session?.pairing_mode).toBe('queue');
      expect(session?.updated_at).toBe('2024-01-02T00:00:00.000Z');
    });

    it('should toggle pairing mode back to smart', () => {
      insertSession();
      repo.updateSessionPairingMode('s1', 'queue', '2024-01-02T00:00:00.000Z');
      repo.updateSessionPairingMode('s1', 'smart', '2024-01-03T00:00:00.000Z');
      const session = repo.getSessionById('s1');
      expect(session?.pairing_mode).toBe('smart');
    });
  });

  // ============================================================
  // Match History Queries
  // ============================================================

  describe('Match History Queries', () => {
    it('should get matches by player ID', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's1', 'Charlie');
      insertPlayer('p4', 's1', 'Dave');
      insertPlayer('p5', 's1', 'Eve');
      repo.createMatch({
        id: 'm1',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p2', 'p3', 'p4']),
        status: 'completed',
        started_at: '2024-01-01T00:00:00.000Z',
        completed_at: '2024-01-01T01:00:00.000Z',
      });
      repo.createMatch({
        id: 'm2',
        session_id: 's1',
        court_number: 1,
        player_ids: JSON.stringify(['p1', 'p5', 'p3', 'p4']),
        status: 'completed',
        started_at: '2024-01-01T02:00:00.000Z',
        completed_at: '2024-01-01T03:00:00.000Z',
      });
      repo.createMatch({
        id: 'm3',
        session_id: 's1',
        court_number: 2,
        player_ids: JSON.stringify(['p2', 'p5', 'p3', 'p4']),
        status: 'completed',
        started_at: '2024-01-01T04:00:00.000Z',
        completed_at: '2024-01-01T05:00:00.000Z',
      });

      // p1 was in m1 and m2
      const p1Matches = repo.getMatchesByPlayerId('s1', 'p1');
      expect(p1Matches).toHaveLength(2);
      // Most recent first
      expect(p1Matches[0].id).toBe('m2');
      expect(p1Matches[1].id).toBe('m1');

      // p5 was in m2 and m3
      const p5Matches = repo.getMatchesByPlayerId('s1', 'p5');
      expect(p5Matches).toHaveLength(2);
    });

    it('should return empty array for player with no matches', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      const matches = repo.getMatchesByPlayerId('s1', 'p1');
      expect(matches).toEqual([]);
    });

    it('should get head-to-head records for a player', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      insertPlayer('p3', 's1', 'Charlie');
      // p1 vs p2: 2 times as opponents
      repo.incrementOpponentCount('s1', 'p1', 'p2');
      repo.incrementOpponentCount('s1', 'p1', 'p2');
      // p1 vs p3: 1 time as opponent
      repo.incrementOpponentCount('s1', 'p1', 'p3');
      // p1 and p2 also teammates once (should not appear in head-to-head)
      repo.incrementTeammateCount('s1', 'p1', 'p2');

      const h2h = repo.getHeadToHeadRecords('s1', 'p1');
      expect(h2h).toHaveLength(2);
      // Both entries should have times_as_opponents > 0
      const p1p2 = h2h.find(r => r.player1_id === 'p1' && r.player2_id === 'p2');
      expect(p1p2?.times_as_opponents).toBe(2);
      const p1p3 = h2h.find(r => r.player1_id === 'p1' && r.player2_id === 'p3');
      expect(p1p3?.times_as_opponents).toBe(1);
    });

    it('should get head-to-head records when player is player2_id', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      // Ordered: p1 < p2, so p1 is player1_id
      repo.incrementOpponentCount('s1', 'p1', 'p2');

      // Query for p2 should still find the record
      const h2h = repo.getHeadToHeadRecords('s1', 'p2');
      expect(h2h).toHaveLength(1);
      expect(h2h[0].player1_id).toBe('p1');
      expect(h2h[0].player2_id).toBe('p2');
    });

    it('should return empty array for player with no opponents', () => {
      insertSession();
      insertPlayer('p1', 's1', 'Alice');
      insertPlayer('p2', 's1', 'Bob');
      // Only teammates, no opponents
      repo.incrementTeammateCount('s1', 'p1', 'p2');
      const h2h = repo.getHeadToHeadRecords('s1', 'p1');
      expect(h2h).toEqual([]);
    });
  });
});

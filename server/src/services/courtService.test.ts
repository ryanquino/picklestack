import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { getDb, closeDb } from '../db';
import * as repo from '../repository';
import { startMatch, completeMatch, getCourts } from './courtService';
import { addPlayer, removePlayer } from './queueService';
import { ValidationError, NotFoundError } from '../errors';
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

describe('CourtService - startMatch', () => {
  beforeEach(() => {
    cleanupDb();
    getDb(); // Initialize fresh database
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id = 's1', courtCount = 4, status = 'active', pairingMode = 'queue') {
    return repo.createSession({
      id,
      name: 'Test Session',
      court_count: courtCount,
      status,
      pairing_mode: pairingMode,
      court_name: '',
      session_type: 'open_play',
      game_mode: 'doubles',
      matching_mode: 'smart',
      live_view_url: `/live/${id}`,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    });
  }

  function addPlayers(sessionId: string, count: number) {
    const players = [];
    for (let i = 0; i < count; i++) {
      players.push(addPlayer(sessionId, `Player${i + 1}`));
    }
    return players;
  }

  // ============================================================
  // Session validation
  // ============================================================

  it('should throw ValidationError when session does not exist', () => {
    expect(() => startMatch('nonexistent', 1)).toThrow(ValidationError);
    expect(() => startMatch('nonexistent', 1)).toThrow('Session not found');
  });

  it('should throw ValidationError when session has ended', () => {
    insertSession('s1', 4, 'ended');
    expect(() => startMatch('s1', 1)).toThrow(ValidationError);
    expect(() => startMatch('s1', 1)).toThrow('Session has ended');
  });

  // ============================================================
  // Court number validation
  // ============================================================

  it('should throw ValidationError for court number less than 1', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);
    expect(() => startMatch('s1', 0)).toThrow(ValidationError);
    expect(() => startMatch('s1', 0)).toThrow('Court number must be between 1 and 4');
  });

  it('should throw ValidationError for court number greater than court_count', () => {
    insertSession('s1', 3);
    addPlayers('s1', 4);
    expect(() => startMatch('s1', 4)).toThrow(ValidationError);
    expect(() => startMatch('s1', 4)).toThrow('Court number must be between 1 and 3');
  });

  // ============================================================
  // Court occupied validation
  // ============================================================

  it('should throw ValidationError when court already has an active match', () => {
    insertSession('s1', 4);
    addPlayers('s1', 8);

    // Start first match on court 1
    startMatch('s1', 1);

    // Try to start another match on court 1
    expect(() => startMatch('s1', 1)).toThrow(ValidationError);
    expect(() => startMatch('s1', 1)).toThrow('Court is already occupied with an active match');
  });

  // ============================================================
  // Queue size validation
  // ============================================================

  it('should throw ValidationError when queue has fewer than 4 players', () => {
    insertSession('s1', 4);
    addPlayers('s1', 3);
    expect(() => startMatch('s1', 1)).toThrow(ValidationError);
    expect(() => startMatch('s1', 1)).toThrow('Not enough players in queue to start a match');
  });

  it('should throw ValidationError when queue is empty', () => {
    insertSession('s1', 4);
    expect(() => startMatch('s1', 1)).toThrow(ValidationError);
  });

  // ============================================================
  // Successful match start
  // ============================================================

  it('should assign top 4 players from queue to the match', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 6);

    const match = startMatch('s1', 1);

    expect(match.playerIds).toHaveLength(4);
    expect(match.playerIds[0]).toBe(players[0].id);
    expect(match.playerIds[1]).toBe(players[1].id);
    expect(match.playerIds[2]).toBe(players[2].id);
    expect(match.playerIds[3]).toBe(players[3].id);
  });

  it('should create match with correct fields', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    const match = startMatch('s1', 2);

    expect(match.id).toBeDefined();
    expect(match.sessionId).toBe('s1');
    expect(match.courtNumber).toBe(2);
    expect(match.status).toBe('active');
    expect(match.startedAt).toBeInstanceOf(Date);
    expect(match.completedAt).toBeUndefined();
  });

  it('should remove assigned players from the queue', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 6);

    startMatch('s1', 1);

    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(2);
    // Only players 5 and 6 should remain
    const remainingIds = queue.map((e) => e.player_id);
    expect(remainingIds).toContain(players[4].id);
    expect(remainingIds).toContain(players[5].id);
    // Players 1-4 should not be in queue
    expect(remainingIds).not.toContain(players[0].id);
    expect(remainingIds).not.toContain(players[1].id);
    expect(remainingIds).not.toContain(players[2].id);
    expect(remainingIds).not.toContain(players[3].id);
  });

  it('should re-number remaining queue positions from 0', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 6);

    startMatch('s1', 1);

    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(2);
    expect(queue[0].position).toBe(0);
    expect(queue[0].player_id).toBe(players[4].id);
    expect(queue[1].position).toBe(1);
    expect(queue[1].player_id).toBe(players[5].id);
  });

  it('should leave empty queue when exactly 4 players are in queue', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    startMatch('s1', 1);

    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(0);
  });

  it('should update session updated_at timestamp', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    const beforeSession = repo.getSessionById('s1');
    const beforeUpdatedAt = beforeSession!.updated_at;

    startMatch('s1', 1);

    const afterSession = repo.getSessionById('s1');
    expect(afterSession!.updated_at).not.toBe(beforeUpdatedAt);
  });

  it('should persist match to database', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    const match = startMatch('s1', 1);

    const dbMatch = repo.getMatchById(match.id);
    expect(dbMatch).toBeDefined();
    expect(dbMatch!.session_id).toBe('s1');
    expect(dbMatch!.court_number).toBe(1);
    expect(dbMatch!.status).toBe('active');
    expect(JSON.parse(dbMatch!.player_ids)).toHaveLength(4);
  });

  // ============================================================
  // Multiple courts
  // ============================================================

  it('should allow starting matches on different courts', () => {
    insertSession('s1', 4);
    addPlayers('s1', 8);

    const match1 = startMatch('s1', 1);
    const match2 = startMatch('s1', 2);

    expect(match1.courtNumber).toBe(1);
    expect(match2.courtNumber).toBe(2);
    expect(match1.playerIds).toHaveLength(4);
    expect(match2.playerIds).toHaveLength(4);

    // No overlap in player assignments
    const allPlayerIds = [...match1.playerIds, ...match2.playerIds];
    const uniqueIds = new Set(allPlayerIds);
    expect(uniqueIds.size).toBe(8);
  });

  it('should assign players in queue order across multiple match starts', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 8);

    const match1 = startMatch('s1', 1);
    const match2 = startMatch('s1', 2);

    // First match gets players 1-4
    expect(match1.playerIds).toEqual([
      players[0].id,
      players[1].id,
      players[2].id,
      players[3].id,
    ]);

    // Second match gets players 5-8
    expect(match2.playerIds).toEqual([
      players[4].id,
      players[5].id,
      players[6].id,
      players[7].id,
    ]);
  });

  // ============================================================
  // Edge cases
  // ============================================================

  it('should work with court number at boundary (court 1)', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    const match = startMatch('s1', 1);
    expect(match.courtNumber).toBe(1);
  });

  it('should work with court number at boundary (max court)', () => {
    insertSession('s1', 12);
    addPlayers('s1', 4);

    const match = startMatch('s1', 12);
    expect(match.courtNumber).toBe(12);
  });
});


describe('CourtService - completeMatch', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id = 's1', courtCount = 4, status = 'active', pairingMode = 'queue') {
    return repo.createSession({
      id,
      name: 'Test Session',
      court_count: courtCount,
      status,
      pairing_mode: pairingMode,
      court_name: '',
      session_type: 'open_play',
      game_mode: 'doubles',
      matching_mode: 'smart',
      live_view_url: `/live/${id}`,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    });
  }

  function addPlayers(sessionId: string, count: number) {
    const players = [];
    for (let i = 0; i < count; i++) {
      players.push(addPlayer(sessionId, `Player${i + 1}`));
    }
    return players;
  }

  // ============================================================
  // Validation errors
  // ============================================================

  it('should throw ValidationError when session does not exist', () => {
    expect(() => completeMatch('nonexistent', 1, { skip: true })).toThrow(ValidationError);
    expect(() => completeMatch('nonexistent', 1, { skip: true })).toThrow('Session not found');
  });

  it('should throw NotFoundError when no active match exists on the court', () => {
    insertSession('s1', 4);
    expect(() => completeMatch('s1', 1, { skip: true })).toThrow(NotFoundError);
    expect(() => completeMatch('s1', 1, { skip: true })).toThrow('No active match on this court');
  });

  it('should preserve all state when no active match exists on the court', () => {
    insertSession('s1', 4);
    addPlayers('s1', 8);

    // Start a match on court 1
    startMatch('s1', 1);

    // Try to complete on court 2 (no active match)
    expect(() => completeMatch('s1', 2, { skip: true })).toThrow(NotFoundError);

    // Verify court 1 match is still active
    const court1Match = repo.getActiveMatchByCourt('s1', 1);
    expect(court1Match).toBeDefined();
    expect(court1Match!.status).toBe('active');

    // Verify queue is unchanged
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(4);
  });

  // ============================================================
  // Successful match completion
  // ============================================================

  it('should return players to queue end in assignment order', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 6);

    // Start match on court 1 (assigns players 1-4)
    const match = startMatch('s1', 1);

    // Queue now has players 5 and 6 at positions 0 and 1
    completeMatch('s1', 1, { skip: true });

    // Queue should now have: Player5(0), Player6(1), Player1(2), Player2(3), Player3(4), Player4(5)
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(6);
    expect(queue[0].player_id).toBe(players[4].id);
    expect(queue[0].position).toBe(0);
    expect(queue[1].player_id).toBe(players[5].id);
    expect(queue[1].position).toBe(1);
    expect(queue[2].player_id).toBe(players[0].id);
    expect(queue[2].position).toBe(2);
    expect(queue[3].player_id).toBe(players[1].id);
    expect(queue[3].position).toBe(3);
    expect(queue[4].player_id).toBe(players[2].id);
    expect(queue[4].position).toBe(4);
    expect(queue[5].player_id).toBe(players[3].id);
    expect(queue[5].position).toBe(5);
  });

  it('should mark the match as completed with completed_at timestamp', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    const match = startMatch('s1', 1);
    completeMatch('s1', 1, { skip: true });

    const dbMatch = repo.getMatchById(match.id);
    expect(dbMatch).toBeDefined();
    expect(dbMatch!.status).toBe('completed');
    expect(dbMatch!.completed_at).not.toBeNull();
  });

  it('should set court to available after completion', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    startMatch('s1', 1);

    // Court 1 should have an active match
    expect(repo.getActiveMatchByCourt('s1', 1)).toBeDefined();

    completeMatch('s1', 1, { skip: true });

    // Court 1 should now be available (no active match)
    expect(repo.getActiveMatchByCourt('s1', 1)).toBeUndefined();
  });

  it('should update session updated_at timestamp', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    startMatch('s1', 1);

    // Get the session state after startMatch
    const beforeSession = repo.getSessionById('s1');
    const beforeUpdatedAt = beforeSession!.updated_at;

    // Manually set updated_at to an older value so we can detect the change
    repo.updateSession('s1', { updated_at: '2024-01-01T00:00:00.000Z' });

    completeMatch('s1', 1, { skip: true });

    const afterSession = repo.getSessionById('s1');
    expect(afterSession!.updated_at).not.toBe('2024-01-01T00:00:00.000Z');
  });

  it('should return players to empty queue starting at position 0', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 4);

    startMatch('s1', 1);

    // Queue is now empty
    expect(repo.getQueueBySession('s1')).toHaveLength(0);

    completeMatch('s1', 1, { skip: true });

    // Players should be at positions 0-3
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(4);
    expect(queue[0].player_id).toBe(players[0].id);
    expect(queue[0].position).toBe(0);
    expect(queue[1].player_id).toBe(players[1].id);
    expect(queue[1].position).toBe(1);
    expect(queue[2].player_id).toBe(players[2].id);
    expect(queue[2].position).toBe(2);
    expect(queue[3].player_id).toBe(players[3].id);
    expect(queue[3].position).toBe(3);
  });

  // ============================================================
  // Removed players excluded
  // ============================================================

  it('should not return removed players to the queue', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 4);

    startMatch('s1', 1);

    // Remove player 2 while they're in the match
    removePlayer('s1', players[1].id);

    completeMatch('s1', 1, { skip: true });

    // Only 3 players should be returned to queue (player 2 excluded)
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(3);
    expect(queue[0].player_id).toBe(players[0].id);
    expect(queue[0].position).toBe(0);
    expect(queue[1].player_id).toBe(players[2].id);
    expect(queue[1].position).toBe(1);
    expect(queue[2].player_id).toBe(players[3].id);
    expect(queue[2].position).toBe(2);
  });

  it('should handle all players removed during match', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 4);

    startMatch('s1', 1);

    // Remove all players
    for (const player of players) {
      removePlayer('s1', player.id);
    }

    completeMatch('s1', 1, { skip: true });

    // Queue should remain empty
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(0);
  });

  it('should preserve assignment order when some players are removed', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 6);

    // Start match assigns players 1-4
    startMatch('s1', 1);

    // Remove players 1 and 3 (index 0 and 2)
    removePlayer('s1', players[0].id);
    removePlayer('s1', players[2].id);

    completeMatch('s1', 1, { skip: true });

    // Queue should have: Player5(0), Player6(1), Player2(2), Player4(3)
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(4);
    expect(queue[0].player_id).toBe(players[4].id);
    expect(queue[1].player_id).toBe(players[5].id);
    expect(queue[2].player_id).toBe(players[1].id); // Player2
    expect(queue[3].player_id).toBe(players[3].id); // Player4
  });

  // ============================================================
  // Options validation
  // ============================================================

  it('should throw ValidationError when no options provided', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);
    startMatch('s1', 1);

    expect(() => completeMatch('s1', 1)).toThrow(ValidationError);
    expect(() => completeMatch('s1', 1)).toThrow('Must select a winning team or skip score');
  });

  it('should throw ValidationError when options are empty object', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);
    startMatch('s1', 1);

    expect(() => completeMatch('s1', 1, {})).toThrow(ValidationError);
    expect(() => completeMatch('s1', 1, {})).toThrow('Must select a winning team or skip score');
  });

  // ============================================================
  // Winning team recording
  // ============================================================

  it('should record match result when winningTeam is team1', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 4);

    const match = startMatch('s1', 1);
    completeMatch('s1', 1, { winningTeam: 'team1' });

    // Match should be completed
    const dbMatch = repo.getMatchById(match.id);
    expect(dbMatch!.status).toBe('completed');

    // Match result should be recorded
    const result = repo.getMatchResultByMatchId(match.id);
    expect(result).toBeDefined();
    const winnerIds = JSON.parse(result!.winner_player_ids);
    const loserIds = JSON.parse(result!.loser_player_ids);
    expect(winnerIds).toEqual([players[0].id, players[1].id]);
    expect(loserIds).toEqual([players[2].id, players[3].id]);
  });

  it('should record match result when winningTeam is team2', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 4);

    const match = startMatch('s1', 1);
    completeMatch('s1', 1, { winningTeam: 'team2' });

    // Match result should be recorded with team2 as winners
    const result = repo.getMatchResultByMatchId(match.id);
    expect(result).toBeDefined();
    const winnerIds = JSON.parse(result!.winner_player_ids);
    const loserIds = JSON.parse(result!.loser_player_ids);
    expect(winnerIds).toEqual([players[2].id, players[3].id]);
    expect(loserIds).toEqual([players[0].id, players[1].id]);
  });

  it('should return players to queue after recording result', () => {
    insertSession('s1', 4);
    const players = addPlayers('s1', 6);

    startMatch('s1', 1);
    completeMatch('s1', 1, { winningTeam: 'team1' });

    // Queue should have: Player5(0), Player6(1), Player1(2), Player2(3), Player3(4), Player4(5)
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(6);
    expect(queue[0].player_id).toBe(players[4].id);
    expect(queue[1].player_id).toBe(players[5].id);
    expect(queue[2].player_id).toBe(players[0].id);
    expect(queue[3].player_id).toBe(players[1].id);
    expect(queue[4].player_id).toBe(players[2].id);
    expect(queue[5].player_id).toBe(players[3].id);
  });

  it('should not record match result when skip is true', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    const match = startMatch('s1', 1);
    completeMatch('s1', 1, { skip: true });

    // Match should be completed
    const dbMatch = repo.getMatchById(match.id);
    expect(dbMatch!.status).toBe('completed');

    // No match result should be recorded
    const result = repo.getMatchResultByMatchId(match.id);
    expect(result).toBeUndefined();
  });

  // ============================================================
  // Multiple courts
  // ============================================================

  it('should complete match on one court without affecting another', () => {
    insertSession('s1', 4);
    addPlayers('s1', 8);

    startMatch('s1', 1);
    startMatch('s1', 2);

    // Complete only court 1
    completeMatch('s1', 1, { skip: true });

    // Court 2 should still have an active match
    expect(repo.getActiveMatchByCourt('s1', 2)).toBeDefined();
    // Court 1 should be available
    expect(repo.getActiveMatchByCourt('s1', 1)).toBeUndefined();
  });
});

describe('CourtService - getCourts', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id = 's1', courtCount = 4, status = 'active', pairingMode = 'queue') {
    return repo.createSession({
      id,
      name: 'Test Session',
      court_count: courtCount,
      status,
      pairing_mode: pairingMode,
      court_name: '',
      session_type: 'open_play',
      game_mode: 'doubles',
      matching_mode: 'smart',
      live_view_url: `/live/${id}`,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    });
  }

  function addPlayers(sessionId: string, count: number) {
    const players = [];
    for (let i = 0; i < count; i++) {
      players.push(addPlayer(sessionId, `Player${i + 1}`));
    }
    return players;
  }

  it('should throw ValidationError when session does not exist', () => {
    expect(() => getCourts('nonexistent')).toThrow(ValidationError);
    expect(() => getCourts('nonexistent')).toThrow('Session not found');
  });

  it('should return all courts as available when no matches are active', () => {
    insertSession('s1', 3);

    const courts = getCourts('s1');

    expect(courts).toHaveLength(3);
    expect(courts[0]).toEqual({ sessionId: 's1', courtNumber: 1, status: 'available' });
    expect(courts[1]).toEqual({ sessionId: 's1', courtNumber: 2, status: 'available' });
    expect(courts[2]).toEqual({ sessionId: 's1', courtNumber: 3, status: 'available' });
  });

  it('should return court as active when it has an active match', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    startMatch('s1', 2);

    const courts = getCourts('s1');

    expect(courts[0].status).toBe('available');
    expect(courts[1].status).toBe('active');
    expect(courts[2].status).toBe('available');
    expect(courts[3].status).toBe('available');
  });

  it('should return correct status for multiple active courts', () => {
    insertSession('s1', 4);
    addPlayers('s1', 8);

    startMatch('s1', 1);
    startMatch('s1', 3);

    const courts = getCourts('s1');

    expect(courts[0].status).toBe('active');
    expect(courts[1].status).toBe('available');
    expect(courts[2].status).toBe('active');
    expect(courts[3].status).toBe('available');
  });

  it('should return court as available after match is completed', () => {
    insertSession('s1', 4);
    addPlayers('s1', 4);

    startMatch('s1', 1);
    completeMatch('s1', 1, { skip: true });

    const courts = getCourts('s1');
    expect(courts[0].status).toBe('available');
  });

  it('should return courts numbered 1 through court_count', () => {
    insertSession('s1', 5);

    const courts = getCourts('s1');

    expect(courts).toHaveLength(5);
    courts.forEach((court, index) => {
      expect(court.courtNumber).toBe(index + 1);
      expect(court.sessionId).toBe('s1');
    });
  });

  it('should handle single court session', () => {
    insertSession('s1', 1);

    const courts = getCourts('s1');

    expect(courts).toHaveLength(1);
    expect(courts[0]).toEqual({ sessionId: 's1', courtNumber: 1, status: 'available' });
  });
});


// ============================================================
// Singles Mode Tests (Task 8.2)
// ============================================================

describe('CourtService - Singles Mode', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSinglesSession(id = 's1', courtCount = 4, status = 'active', pairingMode = 'queue') {
    return repo.createSession({
      id,
      name: 'Singles Session',
      court_count: courtCount,
      status,
      pairing_mode: pairingMode,
      court_name: '',
      session_type: 'open_play',
      game_mode: 'singles',
      matching_mode: 'queue',
      live_view_url: `/live/${id}`,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    });
  }

  function addPlayers(sessionId: string, count: number) {
    const players = [];
    for (let i = 0; i < count; i++) {
      players.push(addPlayer(sessionId, `Player${i + 1}`));
    }
    return players;
  }

  it('should assign exactly 2 players in singles mode', () => {
    insertSinglesSession('s1', 4);
    const players = addPlayers('s1', 4);

    const match = startMatch('s1', 1);

    expect(match.playerIds).toHaveLength(2);
    expect(match.playerIds[0]).toBe(players[0].id);
    expect(match.playerIds[1]).toBe(players[1].id);
  });

  it('should require minimum 2 players in queue for singles mode', () => {
    insertSinglesSession('s1', 4);
    addPlayers('s1', 1);

    expect(() => startMatch('s1', 1)).toThrow(ValidationError);
    expect(() => startMatch('s1', 1)).toThrow('minimum 2 required');
  });

  it('should succeed with exactly 2 players in singles mode', () => {
    insertSinglesSession('s1', 4);
    const players = addPlayers('s1', 2);

    const match = startMatch('s1', 1);

    expect(match.playerIds).toHaveLength(2);
    expect(match.playerIds).toContain(players[0].id);
    expect(match.playerIds).toContain(players[1].id);
  });

  it('should remove only 2 players from queue in singles mode', () => {
    insertSinglesSession('s1', 4);
    const players = addPlayers('s1', 5);

    startMatch('s1', 1);

    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(3);
    // Players 3, 4, 5 should remain
    const remainingIds = queue.map((e) => e.player_id);
    expect(remainingIds).toContain(players[2].id);
    expect(remainingIds).toContain(players[3].id);
    expect(remainingIds).toContain(players[4].id);
  });

  it('should allow multiple singles matches on different courts', () => {
    insertSinglesSession('s1', 4);
    const players = addPlayers('s1', 6);

    const match1 = startMatch('s1', 1);
    const match2 = startMatch('s1', 2);

    expect(match1.playerIds).toHaveLength(2);
    expect(match2.playerIds).toHaveLength(2);

    // No overlap in player assignments
    const allPlayerIds = [...match1.playerIds, ...match2.playerIds];
    const uniqueIds = new Set(allPlayerIds);
    expect(uniqueIds.size).toBe(4);
  });

  it('should complete a singles match and return players to queue', () => {
    insertSinglesSession('s1', 4);
    const players = addPlayers('s1', 4);

    startMatch('s1', 1);

    // Queue should have 2 remaining
    expect(repo.getQueueBySession('s1')).toHaveLength(2);

    completeMatch('s1', 1, { skip: true });

    // All 4 players should be back in queue
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(4);
  });

  it('should record match result correctly in singles mode', () => {
    insertSinglesSession('s1', 4);
    const players = addPlayers('s1', 2);

    const match = startMatch('s1', 1);
    completeMatch('s1', 1, { winningTeam: 'team1' });

    const result = repo.getMatchResultByMatchId(match.id);
    expect(result).toBeDefined();
    const winnerIds = JSON.parse(result!.winner_player_ids);
    const loserIds = JSON.parse(result!.loser_player_ids);
    // In singles, team1 = [player[0]], team2 = [player[1]]
    expect(winnerIds).toEqual([players[0].id]);
    expect(loserIds).toEqual([players[1].id]);
  });
});

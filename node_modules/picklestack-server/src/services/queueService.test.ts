import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { getDb, closeDb } from '../db';
import * as repo from '../repository';
import { addPlayer, movePlayer, removePlayer, getQueue, ValidationError } from './queueService';
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

describe('QueueService - addPlayer', () => {
  beforeEach(() => {
    cleanupDb();
    getDb(); // Initialize fresh database
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id = 's1', status = 'active') {
    return repo.createSession({
      id,
      name: 'Test Session',
      court_count: 4,
      status,
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

  // ============================================================
  // Session validation
  // ============================================================

  it('should throw ValidationError when session does not exist', () => {
    expect(() => addPlayer('nonexistent', 'Alice')).toThrow(ValidationError);
    expect(() => addPlayer('nonexistent', 'Alice')).toThrow('Session not found');
  });

  it('should throw ValidationError when session has ended', () => {
    insertSession('s1', 'ended');
    expect(() => addPlayer('s1', 'Alice')).toThrow(ValidationError);
    expect(() => addPlayer('s1', 'Alice')).toThrow('Session has ended, no new check-ins accepted');
  });

  // ============================================================
  // Name validation
  // ============================================================

  it('should throw ValidationError for empty name', () => {
    insertSession();
    expect(() => addPlayer('s1', '')).toThrow(ValidationError);
  });

  it('should throw ValidationError for whitespace-only name', () => {
    insertSession();
    expect(() => addPlayer('s1', '   ')).toThrow(ValidationError);
    expect(() => addPlayer('s1', '\t\n')).toThrow(ValidationError);
  });

  it('should throw ValidationError for name longer than 30 characters', () => {
    insertSession();
    const longName = 'A'.repeat(31);
    expect(() => addPlayer('s1', longName)).toThrow(ValidationError);
  });

  it('should accept a name with exactly 30 characters', () => {
    insertSession();
    const name = 'A'.repeat(30);
    const player = addPlayer('s1', name);
    expect(player.name).toBe(name);
  });

  it('should accept a name with exactly 1 non-whitespace character', () => {
    insertSession();
    const player = addPlayer('s1', 'A');
    expect(player.name).toBe('A');
  });

  it('should accept a name with leading/trailing whitespace if it has non-whitespace', () => {
    insertSession();
    const player = addPlayer('s1', ' Bob ');
    expect(player.name).toBe(' Bob ');
  });

  // ============================================================
  // Duplicate detection
  // ============================================================

  it('should throw ValidationError for duplicate name (exact match)', () => {
    insertSession();
    addPlayer('s1', 'Alice');
    expect(() => addPlayer('s1', 'Alice')).toThrow(ValidationError);
    expect(() => addPlayer('s1', 'Alice')).toThrow('A player with this name already exists in the session');
  });

  it('should throw ValidationError for duplicate name (case-insensitive)', () => {
    insertSession();
    addPlayer('s1', 'Alice');
    expect(() => addPlayer('s1', 'alice')).toThrow(ValidationError);
    expect(() => addPlayer('s1', 'ALICE')).toThrow(ValidationError);
    expect(() => addPlayer('s1', 'aLiCe')).toThrow(ValidationError);
  });

  it('should allow same name in different sessions', () => {
    insertSession('s1');
    insertSession('s2');
    addPlayer('s1', 'Alice');
    const player = addPlayer('s2', 'Alice');
    expect(player.name).toBe('Alice');
  });

  // ============================================================
  // Queue positioning
  // ============================================================

  it('should place first player at position 0', () => {
    insertSession();
    const player = addPlayer('s1', 'Alice');
    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(1);
    expect(queue[0].player_id).toBe(player.id);
    expect(queue[0].position).toBe(0);
  });

  it('should place subsequent players at end of queue', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');
    const charlie = addPlayer('s1', 'Charlie');

    const queue = repo.getQueueBySession('s1');
    expect(queue).toHaveLength(3);
    expect(queue[0]).toEqual({ player_id: alice.id, session_id: 's1', position: 0, pair_id: null });
    expect(queue[1]).toEqual({ player_id: bob.id, session_id: 's1', position: 1, pair_id: null });
    expect(queue[2]).toEqual({ player_id: charlie.id, session_id: 's1', position: 2, pair_id: null });
  });

  // ============================================================
  // Return value
  // ============================================================

  it('should return a Player with correct fields', () => {
    insertSession();
    const player = addPlayer('s1', 'Alice');
    expect(player.id).toBeDefined();
    expect(player.sessionId).toBe('s1');
    expect(player.name).toBe('Alice');
    expect(player.checkedInAt).toBeInstanceOf(Date);
  });
});


describe('QueueService - getQueue', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id = 's1', status = 'active') {
    return repo.createSession({
      id,
      name: 'Test Session',
      court_count: 4,
      status,
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

  it('should return empty array for session with no players', () => {
    insertSession();
    const queue = getQueue('s1');
    expect(queue).toEqual([]);
  });

  it('should return queue entries with player names ordered by position', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');
    const charlie = addPlayer('s1', 'Charlie');

    const queue = getQueue('s1');
    expect(queue).toHaveLength(3);
    expect(queue[0]).toEqual({ playerId: alice.id, sessionId: 's1', position: 0, playerName: 'Alice', isPairSlot: false, pairId: null, partnerPlayerId: null, partnerPlayerName: null });
    expect(queue[1]).toEqual({ playerId: bob.id, sessionId: 's1', position: 1, playerName: 'Bob', isPairSlot: false, pairId: null, partnerPlayerId: null, partnerPlayerName: null });
    expect(queue[2]).toEqual({ playerId: charlie.id, sessionId: 's1', position: 2, playerName: 'Charlie', isPairSlot: false, pairId: null, partnerPlayerId: null, partnerPlayerName: null });
  });
});

describe('QueueService - movePlayer', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id = 's1', status = 'active') {
    return repo.createSession({
      id,
      name: 'Test Session',
      court_count: 4,
      status,
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

  it('should move a player up by swapping with the player above', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');
    const charlie = addPlayer('s1', 'Charlie');

    const result = movePlayer('s1', bob.id, 'up');
    expect(result[0].playerName).toBe('Bob');
    expect(result[0].position).toBe(0);
    expect(result[1].playerName).toBe('Alice');
    expect(result[1].position).toBe(1);
    expect(result[2].playerName).toBe('Charlie');
    expect(result[2].position).toBe(2);
  });

  it('should move a player down by swapping with the player below', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');
    const charlie = addPlayer('s1', 'Charlie');

    const result = movePlayer('s1', bob.id, 'down');
    expect(result[0].playerName).toBe('Alice');
    expect(result[0].position).toBe(0);
    expect(result[1].playerName).toBe('Charlie');
    expect(result[1].position).toBe(1);
    expect(result[2].playerName).toBe('Bob');
    expect(result[2].position).toBe(2);
  });

  it('should no-op when moving the first player up', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');

    const result = movePlayer('s1', alice.id, 'up');
    expect(result[0].playerName).toBe('Alice');
    expect(result[0].position).toBe(0);
    expect(result[1].playerName).toBe('Bob');
    expect(result[1].position).toBe(1);
  });

  it('should no-op when moving the last player down', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');

    const result = movePlayer('s1', bob.id, 'down');
    expect(result[0].playerName).toBe('Alice');
    expect(result[0].position).toBe(0);
    expect(result[1].playerName).toBe('Bob');
    expect(result[1].position).toBe(1);
  });

  it('should no-op when player is not in the queue', () => {
    insertSession();
    addPlayer('s1', 'Alice');

    const result = movePlayer('s1', 'nonexistent-id', 'up');
    expect(result).toHaveLength(1);
    expect(result[0].playerName).toBe('Alice');
  });

  it('should preserve all players without duplication after move', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');
    const charlie = addPlayer('s1', 'Charlie');
    const dave = addPlayer('s1', 'Dave');

    const result = movePlayer('s1', charlie.id, 'up');
    const names = result.map((e) => e.playerName).sort();
    expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Dave']);
    expect(result).toHaveLength(4);
  });
});

describe('QueueService - removePlayer', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id = 's1', status = 'active') {
    return repo.createSession({
      id,
      name: 'Test Session',
      court_count: 4,
      status,
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

  it('should remove a player from the queue and re-number positions', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');
    const charlie = addPlayer('s1', 'Charlie');

    removePlayer('s1', bob.id);

    const queue = getQueue('s1');
    expect(queue).toHaveLength(2);
    expect(queue[0]).toEqual({ playerId: alice.id, sessionId: 's1', position: 0, playerName: 'Alice', isPairSlot: false, pairId: null, partnerPlayerId: null, partnerPlayerName: null });
    expect(queue[1]).toEqual({ playerId: charlie.id, sessionId: 's1', position: 1, playerName: 'Charlie', isPairSlot: false, pairId: null, partnerPlayerId: null, partnerPlayerName: null });
  });

  it('should remove the first player and re-number from 0', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');
    const charlie = addPlayer('s1', 'Charlie');

    removePlayer('s1', alice.id);

    const queue = getQueue('s1');
    expect(queue).toHaveLength(2);
    expect(queue[0].position).toBe(0);
    expect(queue[0].playerName).toBe('Bob');
    expect(queue[1].position).toBe(1);
    expect(queue[1].playerName).toBe('Charlie');
  });

  it('should remove the last player without affecting others', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');
    const charlie = addPlayer('s1', 'Charlie');

    removePlayer('s1', charlie.id);

    const queue = getQueue('s1');
    expect(queue).toHaveLength(2);
    expect(queue[0].playerName).toBe('Alice');
    expect(queue[1].playerName).toBe('Bob');
  });

  it('should delete the player record from the database', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');

    removePlayer('s1', alice.id);

    const player = repo.getPlayerById(alice.id);
    expect(player).toBeUndefined();
  });

  it('should handle removing a player in an active match', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');
    const bob = addPlayer('s1', 'Bob');

    // Simulate player being in an active match (no queue entry, but has a player record)
    // Remove alice from queue first to simulate being assigned to a match
    repo.deleteQueueEntry(alice.id);

    // Create a match with alice in it
    repo.createMatch({
      id: 'm1',
      session_id: 's1',
      court_number: 1,
      player_ids: JSON.stringify([alice.id, 'p2', 'p3', 'p4']),
      status: 'active',
      started_at: '2024-01-01T00:00:00.000Z',
      completed_at: null,
    });

    // Remove alice - should delete player record
    removePlayer('s1', alice.id);

    // Player record should be gone
    const player = repo.getPlayerById(alice.id);
    expect(player).toBeUndefined();

    // Match should still exist with player_ids unchanged
    const match = repo.getMatchById('m1');
    expect(match).toBeDefined();
    expect(JSON.parse(match!.player_ids)).toContain(alice.id);

    // Bob's queue position should still be correct
    const queue = getQueue('s1');
    expect(queue).toHaveLength(1);
    expect(queue[0].position).toBe(0);
    expect(queue[0].playerName).toBe('Bob');
  });

  it('should result in empty queue when removing the only player', () => {
    insertSession();
    const alice = addPlayer('s1', 'Alice');

    removePlayer('s1', alice.id);

    const queue = getQueue('s1');
    expect(queue).toEqual([]);
  });
});

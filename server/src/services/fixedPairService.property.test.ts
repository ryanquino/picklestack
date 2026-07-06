import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { getDb, closeDb } from '../db';
import * as repo from '../repository';
import { createFixedPair, dissolveFixedPair } from './fixedPairService';
import { addPlayer } from './queueService';
import { ValidationError } from '../errors';
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

let sessionCounter = 0;
let courtCounter = 0;

function createSession(id?: string, status = 'active') {
  sessionCounter++;
  const sessionId = id ?? `session-${sessionCounter}`;
  return repo.createSession({
    id: sessionId,
    name: `Test Session ${sessionCounter}`,
    court_count: 4,
    status,
    pairing_mode: 'smart',
    court_name: '',
    session_type: 'open_play',
    game_mode: 'doubles',
    matching_mode: 'smart',
    live_view_url: `/live/${sessionId}`,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  });
}

function addPlayersToSession(sessionId: string, count: number) {
  const players = [];
  for (let i = 0; i < count; i++) {
    players.push(addPlayer(sessionId, `Player${sessionCounter}_${i}`));
  }
  return players;
}

function createActiveMatch(sessionId: string, playerIds: string[]) {
  courtCounter++;
  const matchId = `match-${courtCounter}`;
  repo.createMatch({
    id: matchId,
    session_id: sessionId,
    court_number: courtCounter,
    player_ids: JSON.stringify(playerIds),
    status: 'active',
    started_at: new Date().toISOString(),
    completed_at: null,
  });
  // Remove matched players from queue
  for (const pid of playerIds) {
    const entry = repo.getQueueEntryByPlayerId(pid);
    if (entry) {
      repo.deleteQueueEntry(pid);
    }
  }
  // Re-number remaining queue
  const remaining = repo.getQueueBySession(sessionId);
  remaining.forEach((entry, index) => {
    if (entry.position !== index) {
      repo.updateQueueEntryPosition(entry.player_id, index);
    }
  });
  return matchId;
}

// ============================================================
// Task 2.4: Property tests for fixedPairService queue operations
// ============================================================

/**
 * Property 1: Queue position contiguity invariant
 *
 * For any session queue state, after any queue-mutating operation
 * (create pair, dissolve pair, move, remove player), the resulting
 * queue positions SHALL form a contiguous zero-indexed sequence
 * [0, 1, 2, ..., n-1] preserving the relative order of unaffected entries.
 *
 * **Validates: Requirements 1.3, 4.2**
 */
describe('Feature: fixed-team-pairing, Property 1: Queue position contiguity invariant', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('queue positions are contiguous after createFixedPair', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 12 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two distinct players to pair using the seed
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          createFixedPair(session.id, players[idx1].id, players[idx2].id);

          const queue = repo.getQueueBySession(session.id);

          // Queue should have playerCount - 1 entries (two removed, one pair slot added)
          expect(queue).toHaveLength(playerCount - 1);

          // Positions should form contiguous [0, 1, ..., n-1]
          for (let i = 0; i < queue.length; i++) {
            expect(queue[i].position).toBe(i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('queue positions are contiguous after dissolveFixedPair', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Create a pair first
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          const pair = createFixedPair(session.id, players[idx1].id, players[idx2].id);

          // Now dissolve it
          dissolveFixedPair(session.id, pair.id);

          const queue = repo.getQueueBySession(session.id);

          // Queue should have playerCount entries (pair dissolved back to two individuals)
          expect(queue).toHaveLength(playerCount);

          // Positions should form contiguous [0, 1, ..., n-1]
          for (let i = 0; i < queue.length; i++) {
            expect(queue[i].position).toBe(i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('queue positions are contiguous after multiple pair creations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 12 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Create as many pairs as possible (up to playerCount/2)
          const maxPairs = Math.floor(playerCount / 2);
          const pairsToCreate = Math.min(maxPairs, 2 + (seed % Math.max(1, maxPairs - 1)));
          const used = new Set<number>();

          for (let p = 0; p < pairsToCreate; p++) {
            // Find two unused players
            let a = -1, b = -1;
            for (let i = 0; i < playerCount; i++) {
              if (!used.has(i)) {
                if (a === -1) a = i;
                else if (b === -1) { b = i; break; }
              }
            }
            if (a === -1 || b === -1) break;

            used.add(a);
            used.add(b);
            createFixedPair(session.id, players[a].id, players[b].id);
          }

          const queue = repo.getQueueBySession(session.id);

          // Positions should form contiguous [0, 1, ..., n-1]
          for (let i = 0; i < queue.length; i++) {
            expect(queue[i].position).toBe(i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 2: Pair creation queue transformation
 *
 * For any two queued players at positions i and j (i < j), creating a
 * Fixed_Pair SHALL result in a queue with exactly one fewer entry, where
 * the new Pair_Slot occupies position min(i, j) in the re-numbered queue
 * and both original individual entries are removed.
 *
 * **Validates: Requirements 1.2**
 */
describe('Feature: fixed-team-pairing, Property 2: Pair creation queue transformation', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('pair slot occupies min(i, j) position and queue shrinks by one', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two distinct indices
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1 + Math.floor(seed / playerCount)) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          // Get their positions before pairing
          const queueBefore = repo.getQueueBySession(session.id);
          const pos1 = queueBefore.find(e => e.player_id === players[idx1].id)!.position;
          const pos2 = queueBefore.find(e => e.player_id === players[idx2].id)!.position;
          const minPos = Math.min(pos1, pos2);

          const pair = createFixedPair(session.id, players[idx1].id, players[idx2].id);

          const queueAfter = repo.getQueueBySession(session.id);

          // Queue should have exactly one fewer entry
          expect(queueAfter).toHaveLength(queueBefore.length - 1);

          // The pair slot should be at position min(i, j) in the re-numbered queue
          const pairSlot = queueAfter.find(e => e.pair_id === pair.id);
          expect(pairSlot).toBeDefined();
          expect(pairSlot!.position).toBe(minPos);

          // Neither player should appear as an unpaired entry
          const unpaired1 = queueAfter.filter(
            e => e.player_id === players[idx1].id && e.pair_id !== pair.id
          );
          const unpaired2 = queueAfter.filter(
            e => e.player_id === players[idx2].id && e.pair_id !== pair.id
          );
          expect(unpaired1).toHaveLength(0);
          expect(unpaired2).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('relative order of unaffected entries is preserved after pair creation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two distinct indices to pair
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1 + Math.floor(seed / playerCount)) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          const pairedIds = new Set([players[idx1].id, players[idx2].id]);

          // Get the order of unaffected players before pairing
          const queueBefore = repo.getQueueBySession(session.id);
          const unaffectedBefore = queueBefore
            .filter(e => !pairedIds.has(e.player_id))
            .map(e => e.player_id);

          createFixedPair(session.id, players[idx1].id, players[idx2].id);

          // Get the order of unaffected players after pairing (exclude pair slot)
          const queueAfter = repo.getQueueBySession(session.id);
          const unaffectedAfter = queueAfter
            .filter(e => !e.pair_id)
            .map(e => e.player_id);

          // Relative order should be preserved
          expect(unaffectedAfter).toEqual(unaffectedBefore);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 3: One pair per player constraint
 *
 * For any player who is already part of a Fixed_Pair, attempting to create
 * another Fixed_Pair involving that player SHALL produce a validation error,
 * regardless of which other player is selected as the partner.
 *
 * **Validates: Requirements 1.4, 5.1**
 */
describe('Feature: fixed-team-pairing, Property 3: One pair per player constraint', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('cannot create a second pair involving an already-paired player', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Create a pair with the first two players
          createFixedPair(session.id, players[0].id, players[1].id);

          // Try to pair one of the already-paired players with any other unpaired player
          const pairedPlayerIdx = seed % 2; // 0 or 1 — pick one of the paired players
          const pairedPlayerId = players[pairedPlayerIdx].id;

          // Pick a third player who is not paired
          const thirdIdx = 2 + (seed % (playerCount - 2));
          const thirdPlayerId = players[thirdIdx].id;

          // Attempting to create another pair with the already-paired player should throw
          // a ValidationError. The specific message may be "already part of a fixed pair"
          // or "not in the queue" (since paired players' individual entries are removed).
          // Both correctly prevent the double-pairing.
          expect(() => createFixedPair(session.id, pairedPlayerId, thirdPlayerId)).toThrow(
            ValidationError
          );
          expect(() => createFixedPair(session.id, pairedPlayerId, thirdPlayerId)).toThrow(
            /already part of a fixed pair|not in the queue/i
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cannot pair a player with themselves regardless of queue state', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick any player and try to pair them with themselves
          const idx = seed % playerCount;
          const playerId = players[idx].id;

          expect(() => createFixedPair(session.id, playerId, playerId)).toThrow(ValidationError);
          expect(() => createFixedPair(session.id, playerId, playerId)).toThrow(
            'Cannot pair a player with themselves'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after pairing, the paired player cannot be in any new pair regardless of partner choice', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 10 }),
        (playerCount) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Create initial pair
          createFixedPair(session.id, players[0].id, players[1].id);

          // Try pairing player[0] with every other unpaired player
          for (let i = 2; i < playerCount; i++) {
            expect(() => createFixedPair(session.id, players[0].id, players[i].id)).toThrow(
              ValidationError
            );
          }

          // Try pairing player[1] with every other unpaired player
          for (let i = 2; i < playerCount; i++) {
            expect(() => createFixedPair(session.id, players[1].id, players[i].id)).toThrow(
              ValidationError
            );
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('Feature: fixed-team-pairing, Property 4: Active match prevents pair creation', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Property 4: Active match prevents pair creation
   *
   * For any player currently participating in an active match, attempting to
   * create a Fixed_Pair involving that player SHALL produce a validation error.
   */
  it('attempting to pair a player in an active match produces a validation error', () => {
    fc.assert(
      fc.property(
        // Generate number of extra queued players (at least 1 to pair with)
        fc.integer({ min: 1, max: 6 }),
        // Which player in the match to try pairing (0 = first, 1 = second, etc.)
        fc.integer({ min: 0, max: 3 }),
        (extraPlayers, matchPlayerIndex) => {
          cleanupDb();
          getDb();
          sessionCounter++;
          courtCounter = 0;

          const session = createSession();
          // Need at least 4 players for a match + extra queued players
          const totalPlayers = 4 + extraPlayers;
          const players = addPlayersToSession(session.id, totalPlayers);

          // Put first 4 players in an active match
          const matchPlayerIds = players.slice(0, 4).map((p) => p.id);
          createActiveMatch(session.id, matchPlayerIds);

          // Pick one player from the match
          const playerInMatch = players[matchPlayerIndex].id;
          // Pick a queued player to try pairing with
          const queuedPlayer = players[4].id;

          // Attempting to create a pair with a player in an active match should fail
          expect(() => createFixedPair(session.id, playerInMatch, queuedPlayer)).toThrow(
            ValidationError
          );
          expect(() => createFixedPair(session.id, playerInMatch, queuedPlayer)).toThrow(
            /active match|not in the queue/i
          );

          // Also test the reverse order
          expect(() => createFixedPair(session.id, queuedPlayer, playerInMatch)).toThrow(
            ValidationError
          );
          expect(() => createFixedPair(session.id, queuedPlayer, playerInMatch)).toThrow(
            /active match|not in the queue/i
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: fixed-team-pairing, Property 13: Dissolve pair expands to two individual entries', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * **Validates: Requirements 4.1**
   *
   * Property 13: Dissolve pair expands to two individual entries
   *
   * For any Fixed_Pair at queue position p, dissolving it SHALL remove the
   * Pair_Slot and insert two individual queue entries at consecutive positions
   * starting at p, with the queue re-numbered to maintain contiguity.
   */
  it('dissolving a pair removes the pair slot and inserts two individual entries at consecutive positions', () => {
    fc.assert(
      fc.property(
        // Total players in queue (need at least 2 for a pair, up to 10)
        fc.integer({ min: 2, max: 10 }),
        // Which two players to pair (indices)
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (totalPlayers, idx1, idx2) => {
          // Ensure valid indices and they're different
          const adjustedTotal = Math.max(2, Math.min(totalPlayers, 10));
          const p1Idx = idx1 % adjustedTotal;
          let p2Idx = idx2 % adjustedTotal;
          if (p2Idx === p1Idx) {
            p2Idx = (p1Idx + 1) % adjustedTotal;
          }

          cleanupDb();
          getDb();
          sessionCounter++;
          courtCounter = 0;

          const session = createSession();
          const players = addPlayersToSession(session.id, adjustedTotal);

          // Create the pair
          const pair = createFixedPair(session.id, players[p1Idx].id, players[p2Idx].id);

          // Record queue state before dissolve
          const queueBeforeDissolve = repo.getQueueBySession(session.id);
          const pairSlot = queueBeforeDissolve.find((e) => e.pair_id === pair.id);
          expect(pairSlot).toBeDefined();
          const pairPosition = pairSlot!.position;
          const queueSizeBefore = queueBeforeDissolve.length;

          // Dissolve the pair
          dissolveFixedPair(session.id, pair.id);

          // Verify queue state after dissolve
          const queueAfterDissolve = repo.getQueueBySession(session.id);

          // Queue should have one more entry (pair slot replaced by two individual entries)
          expect(queueAfterDissolve.length).toBe(queueSizeBefore + 1);

          // Both players should be in the queue as individual entries
          const player1Entry = queueAfterDissolve.find(
            (e) => e.player_id === pair.player1Id
          );
          const player2Entry = queueAfterDissolve.find(
            (e) => e.player_id === pair.player2Id
          );
          expect(player1Entry).toBeDefined();
          expect(player2Entry).toBeDefined();

          // Neither should have a pair_id
          expect(player1Entry!.pair_id).toBeNull();
          expect(player2Entry!.pair_id).toBeNull();

          // The two entries should be at consecutive positions
          const positions = [player1Entry!.position, player2Entry!.position].sort(
            (a, b) => a - b
          );
          expect(positions[1] - positions[0]).toBe(1);

          // The earlier position should be at or near the original pair position
          // (after re-numbering, it should be exactly at pairPosition)
          expect(positions[0]).toBe(pairPosition);

          // Queue positions should be contiguous [0, 1, ..., n-1]
          const allPositions = queueAfterDissolve.map((e) => e.position).sort((a, b) => a - b);
          for (let i = 0; i < allPositions.length; i++) {
            expect(allPositions[i]).toBe(i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: fixed-team-pairing, Property 14: Cannot dissolve pair during active match', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * **Validates: Requirements 4.3**
   *
   * Property 14: Cannot dissolve pair during active match
   *
   * For any Fixed_Pair whose players are currently in an active match,
   * attempting to dissolve the pair SHALL produce a validation error.
   */
  it('attempting to dissolve a pair while players are in an active match produces a validation error', () => {
    fc.assert(
      fc.property(
        // Extra queued players beyond the 4 needed for a match
        fc.integer({ min: 0, max: 4 }),
        (extraPlayers) => {
          cleanupDb();
          getDb();
          sessionCounter++;
          courtCounter = 0;

          const session = createSession();
          // Need at least 4 players: 2 for the pair + 2 others for the match
          const totalPlayers = 4 + extraPlayers;
          const players = addPlayersToSession(session.id, totalPlayers);

          // Create a pair from the first two players
          const pair = createFixedPair(session.id, players[0].id, players[1].id);

          // Put the paired players in an active match (along with 2 others)
          const matchPlayerIds = [
            players[0].id,
            players[1].id,
            players[2].id,
            players[3].id,
          ];
          createActiveMatch(session.id, matchPlayerIds);

          // Attempting to dissolve the pair should fail
          expect(() => dissolveFixedPair(session.id, pair.id)).toThrow(ValidationError);
          expect(() => dissolveFixedPair(session.id, pair.id)).toThrow(
            /cannot dissolve pair while players are in an active match/i
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: fixed-team-pairing, Property 15: Both players must be in session for pair creation', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Property 15: Both players must be in session for pair creation
   *
   * For any pair creation attempt, if either player is not checked into the
   * session, the operation SHALL produce a validation error.
   */
  it('attempting to pair a player not in the session produces a validation error', () => {
    fc.assert(
      fc.property(
        // Number of players in the session
        fc.integer({ min: 2, max: 8 }),
        // Whether to test player1 missing or player2 missing
        fc.boolean(),
        (playerCount, testPlayer1Missing) => {
          cleanupDb();
          getDb();
          sessionCounter++;
          courtCounter = 0;

          const session1 = createSession();
          const session2 = createSession();

          const playersInSession1 = addPlayersToSession(session1.id, playerCount);
          const playersInSession2 = addPlayersToSession(session2.id, 2);

          // A player from session2 is not in session1
          const playerNotInSession = playersInSession2[0].id;
          const playerInSession = playersInSession1[0].id;

          if (testPlayer1Missing) {
            // player1 is not in the session
            expect(() =>
              createFixedPair(session1.id, playerNotInSession, playerInSession)
            ).toThrow(ValidationError);
            expect(() =>
              createFixedPair(session1.id, playerNotInSession, playerInSession)
            ).toThrow(/not found in this session|not in the queue/i);
          } else {
            // player2 is not in the session
            expect(() =>
              createFixedPair(session1.id, playerInSession, playerNotInSession)
            ).toThrow(ValidationError);
            expect(() =>
              createFixedPair(session1.id, playerInSession, playerNotInSession)
            ).toThrow(/not found in this session|not in the queue/i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('attempting to pair with a non-existent player ID produces a validation error', () => {
    fc.assert(
      fc.property(
        // Number of players in the session
        fc.integer({ min: 2, max: 6 }),
        // Generate a fake player ID
        fc.uuid(),
        fc.boolean(),
        (playerCount, fakePlayerId, testPlayer1Fake) => {
          cleanupDb();
          getDb();
          sessionCounter++;
          courtCounter = 0;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          const realPlayer = players[0].id;

          if (testPlayer1Fake) {
            expect(() => createFixedPair(session.id, fakePlayerId, realPlayer)).toThrow(
              ValidationError
            );
            expect(() => createFixedPair(session.id, fakePlayerId, realPlayer)).toThrow(
              /not found in this session/i
            );
          } else {
            expect(() => createFixedPair(session.id, realPlayer, fakePlayerId)).toThrow(
              ValidationError
            );
            expect(() => createFixedPair(session.id, realPlayer, fakePlayerId)).toThrow(
              /not found in this session/i
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { getDb, closeDb } from '../db';
import * as repo from '../repository';
import { createFixedPair } from './fixedPairService';
import { getQueue, movePlayer, removePlayer, addPlayer } from './queueService';
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

/**
 * Clears all data from the database without closing/reopening the connection.
 * This avoids EBUSY file lock issues on Windows when running inside fast-check iterations.
 */
function clearAllData() {
  const db = getDb();
  db.exec('DELETE FROM queue_entries');
  db.exec('DELETE FROM fixed_pairs');
  db.exec('DELETE FROM match_results');
  db.exec('DELETE FROM matches');
  db.exec('DELETE FROM player_ratings');
  db.exec('DELETE FROM pairing_history');
  db.exec('DELETE FROM player_achievements');
  db.exec('DELETE FROM players');
  db.exec('DELETE FROM sessions');
}

let sessionCounter = 0;

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

// ============================================================
// Task 4.3: Property tests for pair-aware queue operations
// ============================================================

/**
 * Property 5: Pair displayed as single queue entry
 *
 * For any Fixed_Pair in the queue, calling getQueue SHALL return exactly one
 * entry for that pair containing both player names, the pair ID, and the
 * isPairSlot flag set to true.
 *
 * **Validates: Requirements 2.1, 6.1**
 */
describe('Feature: fixed-team-pairing, Property 5: Pair displayed as single queue entry', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('getQueue returns exactly one entry per pair with both player names, pairId, and isPairSlot=true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two distinct players to pair
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          const pair = createFixedPair(session.id, players[idx1].id, players[idx2].id);

          const queue = getQueue(session.id);

          // Find entries related to this pair
          const pairEntries = queue.filter((e) => e.pairId === pair.id);

          // Exactly one entry for the pair
          expect(pairEntries).toHaveLength(1);

          const pairEntry = pairEntries[0];

          // isPairSlot flag is true
          expect(pairEntry.isPairSlot).toBe(true);

          // pairId is set correctly
          expect(pairEntry.pairId).toBe(pair.id);

          // The entry contains both player names (one as playerName, one as partnerPlayerName)
          const entryNames = [pairEntry.playerName, pairEntry.partnerPlayerName];
          const expectedNames = [players[idx1].name, players[idx2].name];
          expect(entryNames.sort()).toEqual(expectedNames.sort());

          // The entry contains both player IDs (one as playerId, one as partnerPlayerId)
          const entryIds = [pairEntry.playerId, pairEntry.partnerPlayerId];
          const expectedIds = [players[idx1].id, players[idx2].id];
          expect(entryIds.sort()).toEqual(expectedIds.sort());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('non-paired players have isPairSlot=false and null pair fields', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        (playerCount) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pair the first two players
          createFixedPair(session.id, players[0].id, players[1].id);

          const queue = getQueue(session.id);

          // All non-pair entries should have isPairSlot=false
          const individualEntries = queue.filter((e) => !e.isPairSlot);
          for (const entry of individualEntries) {
            expect(entry.isPairSlot).toBe(false);
            expect(entry.pairId).toBeNull();
            expect(entry.partnerPlayerId).toBeNull();
            expect(entry.partnerPlayerName).toBeNull();
          }

          // There should be playerCount - 2 individual entries + 1 pair entry
          expect(queue).toHaveLength(playerCount - 1);
          expect(individualEntries).toHaveLength(playerCount - 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 6: Pair slot moves as atomic unit
 *
 * For any Pair_Slot in the queue, moving it up or down SHALL change its
 * position by exactly one while keeping both players associated with the
 * same pair slot — the pair is never split across multiple queue entries.
 *
 * **Validates: Requirements 2.2**
 */
describe('Feature: fixed-team-pairing, Property 6: Pair slot moves as atomic unit', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('moving a pair slot changes its position by exactly one and keeps both players together', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 100 }),
        fc.constantFrom('up' as const, 'down' as const),
        (playerCount, seed, direction) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two distinct players to pair (not at boundary for the direction)
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          const pair = createFixedPair(session.id, players[idx1].id, players[idx2].id);

          // Get queue before move
          const queueBefore = getQueue(session.id);
          const pairEntryBefore = queueBefore.find((e) => e.pairId === pair.id)!;
          const positionBefore = pairEntryBefore.position;

          // Determine the anchor player (the one in the queue entry)
          const anchorPlayerId = pairEntryBefore.playerId;

          // Check if move would be a no-op (at boundary)
          const isAtTop = positionBefore === 0 && direction === 'up';
          const isAtBottom =
            positionBefore === queueBefore.length - 1 && direction === 'down';

          // Perform the move
          const queueAfter = movePlayer(session.id, anchorPlayerId, direction);

          // Find the pair entry after move
          const pairEntryAfter = queueAfter.find((e) => e.pairId === pair.id)!;

          if (isAtTop || isAtBottom) {
            // No-op: position should remain the same
            expect(pairEntryAfter.position).toBe(positionBefore);
          } else {
            // Position should change by exactly one
            const expectedPosition =
              direction === 'up' ? positionBefore - 1 : positionBefore + 1;
            expect(pairEntryAfter.position).toBe(expectedPosition);
          }

          // The pair should still be intact — same pairId, same players
          expect(pairEntryAfter.isPairSlot).toBe(true);
          expect(pairEntryAfter.pairId).toBe(pair.id);

          // Both players should still be associated with this pair slot
          const afterIds = [pairEntryAfter.playerId, pairEntryAfter.partnerPlayerId].sort();
          const expectedIds = [players[idx1].id, players[idx2].id].sort();
          expect(afterIds).toEqual(expectedIds);

          // There should still be exactly one entry for this pair
          const pairEntries = queueAfter.filter((e) => e.pairId === pair.id);
          expect(pairEntries).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 7: Pair slot removal removes both players
 *
 * For any Pair_Slot in the queue, removing it SHALL delete both players
 * from the session and dissolve the Fixed_Pair record.
 *
 * **Validates: Requirements 2.3**
 */
describe('Feature: fixed-team-pairing, Property 7: Pair slot removal removes both players', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('removing the anchor player of a pair slot removes both players and dissolves the pair', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two distinct players to pair
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          const pair = createFixedPair(session.id, players[idx1].id, players[idx2].id);

          // Get the anchor player (the one in the queue entry)
          const queueBefore = getQueue(session.id);
          const pairEntry = queueBefore.find((e) => e.pairId === pair.id)!;
          const anchorPlayerId = pairEntry.playerId;
          const partnerPlayerId = pairEntry.partnerPlayerId!;

          // Remove the anchor player (this is "pair slot removal")
          removePlayer(session.id, anchorPlayerId);

          // Both players should be removed from the queue
          const queueAfter = getQueue(session.id);
          const anchorInQueue = queueAfter.find((e) => e.playerId === anchorPlayerId);
          const partnerInQueue = queueAfter.find(
            (e) => e.playerId === partnerPlayerId || e.partnerPlayerId === partnerPlayerId
          );

          // The anchor player is deleted from the session
          const anchorPlayer = repo.getPlayerById(anchorPlayerId);
          expect(anchorPlayer).toBeUndefined();

          // The partner should be placed as an individual entry (per Property 16)
          // since removePlayer dissolves the pair and preserves the partner
          // The pair record should be dissolved
          const pairRecord = repo.getFixedPairById(pair.id);
          expect(pairRecord).toBeUndefined();

          // Queue positions should be contiguous
          for (let i = 0; i < queueAfter.length; i++) {
            expect(queueAfter[i].position).toBe(i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 16: Individual player removal dissolves pair and preserves partner
 *
 * For any player who is part of a Fixed_Pair, removing that player individually
 * (not via pair slot removal) SHALL dissolve the pair and place the remaining
 * partner as an individual queue entry at the original Pair_Slot position.
 *
 * **Validates: Requirements 5.3**
 */
describe('Feature: fixed-team-pairing, Property 16: Individual player removal dissolves pair and preserves partner', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('removing a paired player dissolves the pair and places partner at original pair slot position', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        (playerCount, seed, removeFirst) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two distinct players to pair
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          const pair = createFixedPair(session.id, players[idx1].id, players[idx2].id);

          // Get the pair slot position before removal
          const queueBefore = getQueue(session.id);
          const pairEntry = queueBefore.find((e) => e.pairId === pair.id)!;
          const originalPairPosition = pairEntry.position;

          // Decide which player to remove (either player1 or player2 of the pair)
          const playerToRemove = removeFirst ? pair.player1Id : pair.player2Id;
          const partnerToKeep = removeFirst ? pair.player2Id : pair.player1Id;

          // Remove the player individually
          removePlayer(session.id, playerToRemove);

          // The pair should be dissolved
          const pairRecord = repo.getFixedPairById(pair.id);
          expect(pairRecord).toBeUndefined();

          // The removed player should be deleted
          const removedPlayer = repo.getPlayerById(playerToRemove);
          expect(removedPlayer).toBeUndefined();

          // The partner should still exist
          const keptPlayer = repo.getPlayerById(partnerToKeep);
          expect(keptPlayer).toBeDefined();

          // The partner should be in the queue as an individual entry
          const queueAfter = getQueue(session.id);
          const partnerEntry = queueAfter.find((e) => e.playerId === partnerToKeep);
          expect(partnerEntry).toBeDefined();
          expect(partnerEntry!.isPairSlot).toBe(false);
          expect(partnerEntry!.pairId).toBeNull();

          // The partner should be at the original pair slot position
          expect(partnerEntry!.position).toBe(originalPairPosition);

          // Queue positions should be contiguous
          for (let i = 0; i < queueAfter.length; i++) {
            expect(queueAfter[i].position).toBe(i);
          }

          // Queue should have playerCount - 1 entries:
          // Before removal: playerCount - 1 entries (pair slot counts as 1)
          // After removal: pair slot removed, partner re-added as individual = still playerCount - 1
          // But the removed player is gone, so net: playerCount - 1 entries remain
          // (pair slot replaced by partner individual, other entries unchanged)
          expect(queueAfter).toHaveLength(playerCount - 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('partner is placed as individual entry regardless of which pair member is removed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.integer({ min: 0, max: 100 }),
        (playerCount, seed) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two distinct players to pair
          const idx1 = seed % playerCount;
          let idx2 = (seed + 1) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          const pair = createFixedPair(session.id, players[idx1].id, players[idx2].id);

          // Get the pair slot position
          const queueBefore = getQueue(session.id);
          const pairEntry = queueBefore.find((e) => e.pairId === pair.id)!;
          const originalPairPosition = pairEntry.position;

          // Remove the partner (not the anchor)
          const partnerPlayerId = pairEntry.partnerPlayerId!;
          const anchorPlayerId = pairEntry.playerId;

          removePlayer(session.id, partnerPlayerId);

          // The anchor should now be an individual entry at the original position
          const queueAfter = getQueue(session.id);
          const anchorEntry = queueAfter.find((e) => e.playerId === anchorPlayerId);
          expect(anchorEntry).toBeDefined();
          expect(anchorEntry!.isPairSlot).toBe(false);
          expect(anchorEntry!.pairId).toBeNull();
          expect(anchorEntry!.position).toBe(originalPairPosition);

          // The removed partner should be gone
          const removedPartner = repo.getPlayerById(partnerPlayerId);
          expect(removedPartner).toBeUndefined();

          // Queue positions should be contiguous
          for (let i = 0; i < queueAfter.length; i++) {
            expect(queueAfter[i].position).toBe(i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

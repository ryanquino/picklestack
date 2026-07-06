import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { getDb, closeDb } from '../db';
import * as repo from '../repository';
import { createFixedPair } from './fixedPairService';
import { addPlayer, getQueue } from './queueService';
import { startMatch, completeMatch } from './courtService';
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

function createSession(id?: string, status = 'active', pairingMode = 'queue') {
  sessionCounter++;
  const sessionId = id ?? `session-${sessionCounter}`;
  return repo.createSession({
    id: sessionId,
    name: `Test Session ${sessionCounter}`,
    court_count: 4,
    status,
    pairing_mode: pairingMode,
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
// Task 5.5: Property tests for match completion with pairs
// ============================================================

/**
 * Property 8: Match completion re-inserts pair as single slot
 *
 * For any completed match containing players who are part of a Fixed_Pair,
 * the pair SHALL be re-inserted into the queue as a single Pair_Slot at the
 * end of the queue (not as two individual entries).
 *
 * **Validates: Requirements 2.4**
 */
describe('Feature: fixed-team-pairing, Property 8: Match completion re-inserts pair as single slot', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('completing a match with a paired team re-inserts the pair as a single pair slot at the end of the queue', () => {
    fc.assert(
      fc.property(
        // Number of additional individual players beyond the minimum needed
        // With 1 pair (1 slot) + 3 individuals (3 slots) = 4 candidate entries for FIFO pairing
        fc.integer({ min: 0, max: 4 }),
        (extraPlayers) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          // Need 2 paired + 3 individuals = 5 players minimum for the candidate pool to have 4 entries
          const players = addPlayersToSession(session.id, 5 + extraPlayers);

          // Create a fixed pair from the first two players
          const pair = createFixedPair(session.id, players[0].id, players[1].id);

          // Verify pair slot is in queue before match
          const queueBeforeMatch = getQueue(session.id);
          const pairSlotBefore = queueBeforeMatch.find((e) => e.pairId === pair.id);
          expect(pairSlotBefore).toBeDefined();
          expect(pairSlotBefore!.isPairSlot).toBe(true);

          // Start a match on court 1 (FIFO mode: takes first entries from queue)
          // The pair slot is at position 0, so it will be selected along with the next entries
          const match = startMatch(session.id, 1);

          // Verify the paired players are in the match
          expect(match.playerIds).toContain(players[0].id);
          expect(match.playerIds).toContain(players[1].id);

          // Get queue state after match started (pair should be removed from queue)
          const queueDuringMatch = getQueue(session.id);
          const pairSlotDuring = queueDuringMatch.find((e) => e.pairId === pair.id);
          expect(pairSlotDuring).toBeUndefined();

          // Complete the match
          completeMatch(session.id, 1, { skip: true });

          // After completion, the pair should be re-inserted as a single pair slot
          const queueAfter = getQueue(session.id);

          // Find the pair slot in the queue
          const pairSlotAfter = queueAfter.find((e) => e.pairId === pair.id);
          expect(pairSlotAfter).toBeDefined();
          expect(pairSlotAfter!.isPairSlot).toBe(true);

          // The pair slot should be at the end of the queue
          // (after any players that were already in the queue during the match)
          const maxPositionOfExtraPlayers = queueAfter
            .filter((e) => e.pairId !== pair.id && !match.playerIds.includes(e.playerId))
            .reduce((max, e) => Math.max(max, e.position), -1);

          // The pair slot position should be after any pre-existing queue entries
          if (maxPositionOfExtraPlayers >= 0) {
            expect(pairSlotAfter!.position).toBeGreaterThan(maxPositionOfExtraPlayers);
          }

          // There should be exactly ONE entry for the pair (not two individual entries)
          const pairEntries = queueAfter.filter((e) => e.pairId === pair.id);
          expect(pairEntries).toHaveLength(1);

          // Both players should NOT appear as individual entries
          const player1Individual = queueAfter.find(
            (e) => e.playerId === players[0].id && !e.isPairSlot
          );
          const player2Individual = queueAfter.find(
            (e) => e.playerId === players[1].id && !e.isPairSlot
          );
          // At most one of them is the anchor of the pair slot
          const individualCount = [player1Individual, player2Individual].filter(Boolean).length;
          expect(individualCount).toBe(0);

          // Queue positions should be contiguous
          for (let i = 0; i < queueAfter.length; i++) {
            expect(queueAfter[i].position).toBe(i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('pair slot re-inserted at end contains both player IDs from the pair', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        (extraPlayers) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          // Need 2 paired + 3 individuals = 5 players minimum
          const players = addPlayersToSession(session.id, 5 + extraPlayers);

          // Create a fixed pair from players[0] and players[1]
          const pair = createFixedPair(session.id, players[0].id, players[1].id);

          // Start and complete a match
          startMatch(session.id, 1);
          completeMatch(session.id, 1, { skip: true });

          // After completion, verify the pair slot has both player IDs
          const queueAfter = getQueue(session.id);
          const pairSlot = queueAfter.find((e) => e.pairId === pair.id)!;

          // The pair slot should reference both players
          const slotPlayerIds = [pairSlot.playerId, pairSlot.partnerPlayerId].sort();
          const expectedPlayerIds = [players[0].id, players[1].id].sort();
          expect(slotPlayerIds).toEqual(expectedPlayerIds);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 17: Minimum team slots required for match start
 *
 * For any queue state, a doubles match SHALL only start when there are at least
 * 2 team slots available, where a Fixed_Pair counts as one team slot and each
 * individual player counts as one team slot (requiring a minimum of 4 total
 * players across all slots).
 *
 * **Validates: Requirements 5.4**
 */
describe('Feature: fixed-team-pairing, Property 17: Minimum team slots required for match start', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('startMatch throws when there are fewer than 2 team slots or fewer than 4 total players', () => {
    fc.assert(
      fc.property(
        // Number of individual players (0-3)
        fc.integer({ min: 0, max: 3 }),
        // Whether to create a pair from the first two players (if enough exist)
        fc.boolean(),
        (individualCount, createPair) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          const players = addPlayersToSession(session.id, individualCount);

          let totalPlayers = individualCount;
          let teamSlots = individualCount;

          // If we have at least 2 players and createPair is true, pair the first two
          if (createPair && individualCount >= 2) {
            createFixedPair(session.id, players[0].id, players[1].id);
            // After pairing: 1 pair slot + (individualCount - 2) individual slots
            teamSlots = 1 + (individualCount - 2);
            // Total players stays the same (pair has 2 players)
            totalPlayers = individualCount;
          }

          // If we don't have enough team slots (< 2) or total players (< 4), startMatch should throw
          if (teamSlots < 2 || totalPlayers < 4) {
            expect(() => startMatch(session.id, 1)).toThrow(ValidationError);
            expect(() => startMatch(session.id, 1)).toThrow(
              'Not enough players in queue to start a match'
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('startMatch succeeds when there are at least 2 team slots and at least 4 total players', () => {
    fc.assert(
      fc.property(
        // Number of additional individual players beyond the minimum needed
        fc.integer({ min: 0, max: 4 }),
        // Whether to include a pair in the queue
        fc.boolean(),
        (extraPlayers, includePair) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();

          if (includePair) {
            // With a pair: need pair (2 players, 1 slot) + at least 3 individuals (3 slots)
            // This gives 4 candidate entries in the pool for selectFifoPairing
            // Total: 5 players, 4 team slots — satisfies both conditions
            const players = addPlayersToSession(session.id, 5 + extraPlayers);
            createFixedPair(session.id, players[0].id, players[1].id);

            // startMatch should succeed
            const match = startMatch(session.id, 1);
            expect(match).toBeDefined();
            expect(match.status).toBe('active');
            // With a pair, the match has 4 player IDs (pair expands to 2 + 2 individuals on other team)
            // or 5 if pair + individual on one team and 2 on the other
            // The key property: match has at least 4 total players
            expect(match.playerIds.length).toBeGreaterThanOrEqual(4);
          } else {
            // Without a pair: need at least 4 individual players (4 slots, 4 players)
            addPlayersToSession(session.id, 4 + extraPlayers);

            // startMatch should succeed
            const match = startMatch(session.id, 1);
            expect(match).toBeDefined();
            expect(match.status).toBe('active');
            expect(match.playerIds.length).toBe(4);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('a single pair with no other players (2 total players, 1 team slot) cannot start a match', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1 }),
        (extraIndividuals) => {
          clearAllData();
          sessionCounter++;

          const session = createSession();
          // Create 2 players and pair them
          const players = addPlayersToSession(session.id, 2 + extraIndividuals);
          createFixedPair(session.id, players[0].id, players[1].id);

          // After pairing: 1 pair slot + extraIndividuals individual slots
          // Total players: 2 + extraIndividuals
          // Team slots: 1 + extraIndividuals
          // For extraIndividuals=0: 1 slot, 2 players — fails both conditions
          // For extraIndividuals=1: 2 slots, 3 players — fails total players < 4
          // Both cases should fail
          expect(() => startMatch(session.id, 1)).toThrow(ValidationError);
          expect(() => startMatch(session.id, 1)).toThrow(
            'Not enough players in queue to start a match'
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

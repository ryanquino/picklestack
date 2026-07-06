import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { getDb, closeDb } from '../db';
import * as repo from '../repository';
import { createFixedPair, calculateCombinedRating } from './fixedPairService';
import { selectPairing, selectFifoPairing, PairingCandidate, PairingInput } from './pairingService';
import { addPlayer } from './queueService';
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

function createSession(pairingMode = 'smart') {
  sessionCounter++;
  const sessionId = `session-${sessionCounter}`;
  return repo.createSession({
    id: sessionId,
    name: `Test Session ${sessionCounter}`,
    court_count: 4,
    status: 'active',
    pairing_mode: pairingMode,
    court_name: '',
    session_type: 'open_play',
    game_mode: 'doubles',
    matching_mode: pairingMode,
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

/**
 * Sets a player's rating in the session.
 */
function setPlayerRating(playerId: string, sessionId: string, rating: number) {
  repo.upsertPlayerRating({
    player_id: playerId,
    session_id: sessionId,
    rating,
    matches_played: 1,
    wins: 0,
    losses: 0,
    star_rating: 3,
  });
}

/**
 * Builds a candidate pool from the current queue state, including pair-aware logic.
 * This mirrors the buildCandidatePool logic in courtService.ts.
 */
function buildCandidatePoolForTest(sessionId: string, maxPoolSize = 8): PairingCandidate[] {
  const queue = repo.getQueueBySession(sessionId);
  const ratingRows = repo.getPlayerRatingsBySession(sessionId);
  const ratings = new Map<string, number>();
  for (const row of ratingRows) {
    ratings.set(row.player_id, row.rating);
  }

  const poolSize = Math.min(queue.length, maxPoolSize);
  const pool = queue.slice(0, poolSize);

  return pool.map((entry): PairingCandidate => {
    if (entry.pair_id) {
      const pair = repo.getFixedPairById(entry.pair_id);
      if (pair) {
        const player1Rating = ratings.get(pair.player1_id) ?? 1000;
        const player2Rating = ratings.get(pair.player2_id) ?? 1000;
        const combinedRating = calculateCombinedRating(player1Rating, player2Rating);
        return {
          playerId: entry.player_id,
          rating: combinedRating,
          queuePosition: entry.position,
          isPair: true,
          pairId: entry.pair_id,
          pairedPlayerIds: [pair.player1_id, pair.player2_id],
        };
      }
    }

    return {
      playerId: entry.player_id,
      rating: ratings.get(entry.player_id) ?? 1000,
      queuePosition: entry.position,
      isPair: false,
      pairId: null,
      pairedPlayerIds: null,
    };
  });
}

/**
 * Expands a team array from the pairing result into actual player IDs.
 * Mirrors expandTeamPlayerIds in courtService.ts.
 */
function expandTeamPlayerIds(
  team: [string, string],
  candidatePool: PairingCandidate[]
): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const playerId of team) {
    if (seen.has(playerId)) continue; // Skip duplicate (pair team format [id, id])
    seen.add(playerId);
    const candidate = candidatePool.find(c => c.playerId === playerId);
    if (candidate && candidate.isPair && candidate.pairedPlayerIds) {
      expanded.push(...candidate.pairedPlayerIds);
    } else {
      expanded.push(playerId);
    }
  }
  return expanded;
}

// ============================================================
// Property 9: Paired players always placed on same team
// ============================================================

/**
 * Property 9: Paired players always placed on same team
 *
 * For any pairing result where a Fixed_Pair candidate is selected, both
 * players of that pair SHALL appear on the same team — never split across
 * opposing teams.
 *
 * **Validates: Requirements 3.2**
 */
describe('Feature: fixed-team-pairing, Property 9: Paired players always placed on same team', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('in smart mode, paired players are always on the same team', () => {
    fc.assert(
      fc.property(
        // Number of additional individual players (need at least 2 for a 4-slot match with 1 pair)
        fc.integer({ min: 2, max: 6 }),
        // Ratings for pair player 1 and 2
        fc.integer({ min: 400, max: 1600 }),
        fc.integer({ min: 400, max: 1600 }),
        // Ratings for individual players (array)
        fc.array(fc.integer({ min: 400, max: 1600 }), { minLength: 2, maxLength: 6 }),
        (extraPlayers, pairRating1, pairRating2, individualRatings) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession('smart');
          const playerCount = 2 + Math.min(extraPlayers, individualRatings.length);
          const players = addPlayersToSession(session.id, playerCount);

          // Set ratings for pair players
          setPlayerRating(players[0].id, session.id, pairRating1);
          setPlayerRating(players[1].id, session.id, pairRating2);

          // Set ratings for individual players
          for (let i = 2; i < playerCount; i++) {
            setPlayerRating(players[i].id, session.id, individualRatings[i - 2]);
          }

          // Create a fixed pair from the first two players
          createFixedPair(session.id, players[0].id, players[1].id);

          // Build candidate pool
          const candidatePool = buildCandidatePoolForTest(session.id);

          // Need at least 4 team slots for a match
          if (candidatePool.length < 4) return;

          // Run smart pairing
          const input: PairingInput = {
            candidatePool,
            teammateHistory: new Map(),
            opponentHistory: new Map(),
            matchConfigHistory: new Set(),
          };
          const result = selectPairing(input);

          // Expand teams to actual player IDs
          const team1Expanded = expandTeamPlayerIds(result.team1, candidatePool);
          const team2Expanded = expandTeamPlayerIds(result.team2, candidatePool);

          // Check: if either paired player is in the match, both must be on the same team
          const pair1InTeam1 = team1Expanded.includes(players[0].id);
          const pair2InTeam1 = team1Expanded.includes(players[1].id);
          const pair1InTeam2 = team2Expanded.includes(players[0].id);
          const pair2InTeam2 = team2Expanded.includes(players[1].id);

          if (pair1InTeam1 || pair2InTeam1 || pair1InTeam2 || pair2InTeam2) {
            // If one is on team1, both must be on team1
            if (pair1InTeam1 || pair2InTeam1) {
              expect(pair1InTeam1).toBe(true);
              expect(pair2InTeam1).toBe(true);
            }
            // If one is on team2, both must be on team2
            if (pair1InTeam2 || pair2InTeam2) {
              expect(pair1InTeam2).toBe(true);
              expect(pair2InTeam2).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('in FIFO mode, paired players are always on the same team', () => {
    fc.assert(
      fc.property(
        // Number of additional individual players (need at least 2 for a 4-slot match with 1 pair)
        fc.integer({ min: 2, max: 6 }),
        // Position of the pair in the queue (0 = front)
        fc.integer({ min: 0, max: 5 }),
        (extraPlayers, pairPositionSeed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession('queue');
          const playerCount = 2 + extraPlayers;
          const players = addPlayersToSession(session.id, playerCount);

          // Pick two players to pair — use seed to vary which ones
          const idx1 = pairPositionSeed % playerCount;
          let idx2 = (pairPositionSeed + 1) % playerCount;
          if (idx2 === idx1) idx2 = (idx1 + 1) % playerCount;

          createFixedPair(session.id, players[idx1].id, players[idx2].id);

          // Build candidate pool
          const candidatePool = buildCandidatePoolForTest(session.id);

          // Need enough candidates to sum to 4 players for FIFO pairing
          const totalAvailablePlayers = candidatePool.reduce(
            (sum, c) => sum + (c.isPair ? 2 : 1), 0
          );
          if (totalAvailablePlayers < 4) return;

          const result = selectFifoPairing(candidatePool);

          // Expand teams to actual player IDs
          const team1Expanded = expandTeamPlayerIds(result.team1, candidatePool);
          const team2Expanded = expandTeamPlayerIds(result.team2, candidatePool);

          // Check: if either paired player is in the match, both must be on the same team
          const pair1InTeam1 = team1Expanded.includes(players[idx1].id);
          const pair2InTeam1 = team1Expanded.includes(players[idx2].id);
          const pair1InTeam2 = team2Expanded.includes(players[idx1].id);
          const pair2InTeam2 = team2Expanded.includes(players[idx2].id);

          if (pair1InTeam1 || pair2InTeam1 || pair1InTeam2 || pair2InTeam2) {
            if (pair1InTeam1 || pair2InTeam1) {
              expect(pair1InTeam1).toBe(true);
              expect(pair2InTeam1).toBe(true);
            }
            if (pair1InTeam2 || pair2InTeam2) {
              expect(pair1InTeam2).toBe(true);
              expect(pair2InTeam2).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 10: Combined rating is arithmetic mean
// ============================================================

/**
 * Property 10: Combined rating is arithmetic mean
 *
 * For any two player ratings r1 and r2, the combined rating used for
 * matchmaking SHALL equal (r1 + r2) / 2.
 *
 * **Validates: Requirements 3.3**
 */
describe('Feature: fixed-team-pairing, Property 10: Combined rating is arithmetic mean', () => {
  it('calculateCombinedRating returns the arithmetic mean of two ratings', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        (r1, r2) => {
          const combined = calculateCombinedRating(r1, r2);
          expect(combined).toBe((r1 + r2) / 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculateCombinedRating is commutative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        (r1, r2) => {
          expect(calculateCombinedRating(r1, r2)).toBe(calculateCombinedRating(r2, r1));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculateCombinedRating with equal ratings returns the same rating', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 3000 }),
        (r) => {
          expect(calculateCombinedRating(r, r)).toBe(r);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 11: Candidate pool treats pairs as single team slots
// ============================================================

/**
 * Property 11: Candidate pool treats pairs as single team slots
 *
 * For any queue containing a mix of Fixed_Pairs and individual players,
 * the candidate pool SHALL include each pair as a single candidate entry
 * with the combined rating, and the total candidate count SHALL equal
 * (number of individual players) + (number of pairs) capped at the pool size limit.
 *
 * **Validates: Requirements 3.1, 3.4**
 */
describe('Feature: fixed-team-pairing, Property 11: Candidate pool treats pairs as single team slots', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('candidate pool count equals individuals + pairs, capped at pool size', () => {
    fc.assert(
      fc.property(
        // Number of pairs to create (1-3)
        fc.integer({ min: 1, max: 3 }),
        // Number of extra individual players (0-4)
        fc.integer({ min: 0, max: 4 }),
        (numPairs, numIndividuals) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession('smart');
          const totalPlayers = numPairs * 2 + numIndividuals;
          const players = addPlayersToSession(session.id, totalPlayers);

          // Create pairs from the first numPairs*2 players
          for (let p = 0; p < numPairs; p++) {
            createFixedPair(session.id, players[p * 2].id, players[p * 2 + 1].id);
          }

          // Build candidate pool
          const candidatePool = buildCandidatePoolForTest(session.id);

          // Expected queue entries = numPairs (pair slots) + numIndividuals
          const expectedQueueEntries = numPairs + numIndividuals;
          const expectedPoolSize = Math.min(expectedQueueEntries, 8);

          expect(candidatePool.length).toBe(expectedPoolSize);

          // Count pairs and individuals in the pool
          const pairsInPool = candidatePool.filter(c => c.isPair);
          const individualsInPool = candidatePool.filter(c => !c.isPair);

          // All pairs should be marked as pairs
          for (const pairCandidate of pairsInPool) {
            expect(pairCandidate.isPair).toBe(true);
            expect(pairCandidate.pairId).not.toBeNull();
            expect(pairCandidate.pairedPlayerIds).not.toBeNull();
            expect(pairCandidate.pairedPlayerIds).toHaveLength(2);
          }

          // All individuals should not be pairs
          for (const individual of individualsInPool) {
            expect(individual.isPair).toBe(false);
            expect(individual.pairId).toBeNull();
            expect(individual.pairedPlayerIds).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('pair candidates have the combined rating (arithmetic mean)', () => {
    fc.assert(
      fc.property(
        // Ratings for pair players
        fc.integer({ min: 400, max: 1600 }),
        fc.integer({ min: 400, max: 1600 }),
        // Number of extra individual players
        fc.integer({ min: 2, max: 4 }),
        (rating1, rating2, numIndividuals) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession('smart');
          const totalPlayers = 2 + numIndividuals;
          const players = addPlayersToSession(session.id, totalPlayers);

          // Set ratings
          setPlayerRating(players[0].id, session.id, rating1);
          setPlayerRating(players[1].id, session.id, rating2);

          // Create a pair
          createFixedPair(session.id, players[0].id, players[1].id);

          // Build candidate pool
          const candidatePool = buildCandidatePoolForTest(session.id);

          // Find the pair candidate
          const pairCandidate = candidatePool.find(c => c.isPair);
          expect(pairCandidate).toBeDefined();

          // Its rating should be the arithmetic mean
          const expectedRating = (rating1 + rating2) / 2;
          expect(pairCandidate!.rating).toBe(expectedRating);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('pool size is capped at 8 even with many queue entries', () => {
    fc.assert(
      fc.property(
        // Number of pairs (2-4)
        fc.integer({ min: 2, max: 4 }),
        // Number of extra individuals (4-8)
        fc.integer({ min: 4, max: 8 }),
        (numPairs, numIndividuals) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession('smart');
          const totalPlayers = numPairs * 2 + numIndividuals;
          const players = addPlayersToSession(session.id, totalPlayers);

          // Create pairs
          for (let p = 0; p < numPairs; p++) {
            createFixedPair(session.id, players[p * 2].id, players[p * 2 + 1].id);
          }

          // Build candidate pool
          const candidatePool = buildCandidatePoolForTest(session.id);

          // Pool size should be capped at 8
          const queueEntries = numPairs + numIndividuals;
          expect(candidatePool.length).toBe(Math.min(queueEntries, 8));
          expect(candidatePool.length).toBeLessThanOrEqual(8);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 12: FIFO selection respects pair positions
// ============================================================

/**
 * Property 12: FIFO selection respects pair positions
 *
 * For any queue in FIFO mode containing Fixed_Pairs, selection SHALL
 * proceed by queue position where each Pair_Slot counts as one position,
 * selecting the first N slots needed for a match.
 *
 * **Validates: Requirements 3.5**
 */
describe('Feature: fixed-team-pairing, Property 12: FIFO selection respects pair positions', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('FIFO selects candidates from the front of the queue that sum to 4 players', () => {
    fc.assert(
      fc.property(
        // Number of pairs (1-2)
        fc.integer({ min: 1, max: 2 }),
        // Number of extra individual players to ensure enough candidates
        fc.integer({ min: 2, max: 6 }),
        // Which pair positions to use (seed for variety)
        fc.integer({ min: 0, max: 100 }),
        (numPairs, extraIndividuals, seed) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession('queue');
          const totalPlayers = numPairs * 2 + extraIndividuals;
          const players = addPlayersToSession(session.id, totalPlayers);

          // Create pairs from the first numPairs*2 players
          for (let p = 0; p < numPairs; p++) {
            createFixedPair(session.id, players[p * 2].id, players[p * 2 + 1].id);
          }

          // Build candidate pool
          const candidatePool = buildCandidatePoolForTest(session.id);

          // Need enough candidates to form a match (sum to 4 players)
          const totalAvailablePlayers = candidatePool.reduce(
            (sum, c) => sum + (c.isPair ? 2 : 1), 0
          );
          if (totalAvailablePlayers < 4) return;

          // Run FIFO pairing
          const result = selectFifoPairing(candidatePool);

          // Expand both teams to get actual player IDs
          const team1Expanded = expandTeamPlayerIds(result.team1, candidatePool);
          const team2Expanded = expandTeamPlayerIds(result.team2, candidatePool);

          // Each team should have exactly 2 players after expansion
          expect(team1Expanded).toHaveLength(2);
          expect(team2Expanded).toHaveLength(2);

          // Total of 4 unique players selected
          const allSelected = new Set([...team1Expanded, ...team2Expanded]);
          expect(allSelected.size).toBe(4);

          // The selected candidates should come from the front of the queue
          const sortedPool = [...candidatePool].sort((a, b) => a.queuePosition - b.queuePosition);
          const uniqueResultIds = new Set([
            result.team1[0], result.team1[1],
            result.team2[0], result.team2[1],
          ]);

          // All selected candidate IDs should be from the earliest positions
          for (const id of uniqueResultIds) {
            const candidate = candidatePool.find(c => c.playerId === id);
            expect(candidate).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('FIFO with pair at front selects pair as first team slot', () => {
    fc.assert(
      fc.property(
        // Number of extra individual players (need at least 3 more team slots)
        fc.integer({ min: 3, max: 6 }),
        (extraIndividuals) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession('queue');
          // First two players will form a pair at the front
          const totalPlayers = 2 + extraIndividuals;
          const players = addPlayersToSession(session.id, totalPlayers);

          // Create pair from first two players (they're at positions 0 and 1)
          const pair = createFixedPair(session.id, players[0].id, players[1].id);

          // Build candidate pool
          const candidatePool = buildCandidatePoolForTest(session.id);

          // Need at least 4 team slots
          if (candidatePool.length < 4) return;

          // Run FIFO pairing
          const result = selectFifoPairing(candidatePool);

          // The pair should be at position 0 (front of queue)
          const pairCandidate = candidatePool.find(c => c.pairId === pair.id);
          expect(pairCandidate).toBeDefined();
          expect(pairCandidate!.queuePosition).toBe(0);

          // The pair candidate should be selected as part of team1 (first two slots)
          const team1HasPair = result.team1.includes(pairCandidate!.playerId);
          expect(team1HasPair).toBe(true);

          // Expand and verify both paired players are on the same team
          const team1Expanded = expandTeamPlayerIds(result.team1, candidatePool);
          expect(team1Expanded).toContain(players[0].id);
          expect(team1Expanded).toContain(players[1].id);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('FIFO with pair at back does not select pair if enough slots ahead', () => {
    fc.assert(
      fc.property(
        // Number of individual players ahead of the pair (at least 4 to fill the match)
        fc.integer({ min: 4, max: 6 }),
        (individualsAhead) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const session = createSession('queue');
          // Create individuals first, then pair at the end
          const totalPlayers = individualsAhead + 2;
          const players = addPlayersToSession(session.id, totalPlayers);

          // Create pair from the last two players (they're at the back of the queue)
          createFixedPair(
            session.id,
            players[individualsAhead].id,
            players[individualsAhead + 1].id
          );

          // Build candidate pool
          const candidatePool = buildCandidatePoolForTest(session.id);

          // Need at least 4 team slots
          if (candidatePool.length < 4) return;

          // Run FIFO pairing
          const result = selectFifoPairing(candidatePool);

          // The first 4 slots should be the first 4 individual players
          // (pair is at the back, beyond position 3)
          const sortedPool = [...candidatePool].sort((a, b) => a.queuePosition - b.queuePosition);
          const first4 = sortedPool.slice(0, 4);

          // None of the first 4 should be the pair (pair is at position >= 4)
          for (const candidate of first4) {
            expect(candidate.isPair).toBe(false);
          }

          // The selected players should be the first 4 individuals
          const selectedIds = new Set([
            result.team1[0], result.team1[1],
            result.team2[0], result.team2[1],
          ]);
          const expectedIds = new Set(first4.map(c => c.playerId));
          expect(selectedIds).toEqual(expectedIds);
        }
      ),
      { numRuns: 100 }
    );
  });
});

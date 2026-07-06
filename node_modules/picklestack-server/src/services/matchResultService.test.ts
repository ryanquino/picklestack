import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { getDb, closeDb } from '../db';
import * as repo from '../repository';
import { recordMatchResult } from './matchResultService';
import { addPlayer } from './queueService';
import { v4 as uuidv4 } from 'uuid';
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

// Feature: smart-match-scoring, Property 7: Pairing history accuracy
/**
 * Property 7: Pairing history accuracy
 *
 * For any sequence of completed matches in a session, the recorded teammate count
 * for each player pair SHALL equal the number of matches where those two players
 * were on the same team, and the recorded opponent count SHALL equal the number of
 * matches where those two players were on opposing teams.
 *
 * Validates: Requirements 4.1, 4.2
 */
describe('Property 7: Pairing history accuracy', () => {
  let courtCounter: number;

  beforeEach(() => {
    cleanupDb();
    getDb();
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id: string, courtCount = 100) {
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

  function createPlayersForSession(sessionId: string, count: number): string[] {
    const playerIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const player = addPlayer(sessionId, `Player${i + 1}`);
      playerIds.push(player.id);
    }
    return playerIds;
  }

  /**
   * Creates a match row directly in the database for a given set of 4 player IDs.
   * Uses an incrementing court number to avoid the active court unique constraint.
   */
  function createMatchDirectly(sessionId: string, playerIds: [string, string, string, string]): string {
    courtCounter++;
    const matchId = uuidv4();
    repo.createMatch({
      id: matchId,
      session_id: sessionId,
      court_number: courtCounter,
      player_ids: JSON.stringify(playerIds),
      status: 'active',
      started_at: new Date().toISOString(),
      completed_at: null,
    });
    return matchId;
  }

  /**
   * Returns ordered pair key for consistent lookups (player1_id < player2_id).
   */
  function pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  // **Validates: Requirements 4.1, 4.2**
  it('teammate and opponent counts match actual match history after N matches', () => {
    fc.assert(
      fc.property(
        // Generate a pool of 6-10 players and 1-8 matches
        fc.integer({ min: 6, max: 10 }),
        fc.array(
          fc.record({
            // Indices into the player pool for the 4 players in a match
            p0: fc.nat({ max: 99 }),
            p1: fc.nat({ max: 99 }),
            p2: fc.nat({ max: 99 }),
            p3: fc.nat({ max: 99 }),
            winningTeam: fc.constantFrom('team1' as const, 'team2' as const),
          }),
          { minLength: 1, maxLength: 8 }
        ),
        (numPlayers, matchSpecs) => {
          // Setup: create session and players
          const sessionId = uuidv4();
          insertSession(sessionId);
          const playerIds = createPlayersForSession(sessionId, numPlayers);

          // Track expected teammate and opponent counts
          const expectedTeammates = new Map<string, number>();
          const expectedOpponents = new Map<string, number>();

          // Record each match
          for (const spec of matchSpecs) {
            // Map indices to actual player IDs (mod numPlayers), ensuring 4 distinct players
            const indices = [
              spec.p0 % numPlayers,
              spec.p1 % numPlayers,
              spec.p2 % numPlayers,
              spec.p3 % numPlayers,
            ];

            // Ensure all 4 players are distinct
            const uniqueIndices = new Set(indices);
            if (uniqueIndices.size < 4) {
              continue;
            }

            const matchPlayerIds: [string, string, string, string] = [
              playerIds[indices[0]],
              playerIds[indices[1]],
              playerIds[indices[2]],
              playerIds[indices[3]],
            ];

            // Create match and record result
            const matchId = createMatchDirectly(sessionId, matchPlayerIds);
            recordMatchResult({
              matchId,
              sessionId,
              winningTeam: spec.winningTeam,
            });

            // Track expected teammate counts
            // Team 1: players[0] & players[1]
            const team1Key = pairKey(matchPlayerIds[0], matchPlayerIds[1]);
            expectedTeammates.set(team1Key, (expectedTeammates.get(team1Key) ?? 0) + 1);

            // Team 2: players[2] & players[3]
            const team2Key = pairKey(matchPlayerIds[2], matchPlayerIds[3]);
            expectedTeammates.set(team2Key, (expectedTeammates.get(team2Key) ?? 0) + 1);

            // Track expected opponent counts (each team1 member vs each team2 member)
            for (const t1Player of [matchPlayerIds[0], matchPlayerIds[1]]) {
              for (const t2Player of [matchPlayerIds[2], matchPlayerIds[3]]) {
                const oppKey = pairKey(t1Player, t2Player);
                expectedOpponents.set(oppKey, (expectedOpponents.get(oppKey) ?? 0) + 1);
              }
            }
          }

          // Verify: check all expected teammate counts
          for (const [key, expectedCount] of expectedTeammates) {
            const [p1, p2] = key.split('|');
            const history = repo.getPairingHistory(sessionId, p1, p2);
            expect(history).toBeDefined();
            expect(history!.times_as_teammates).toBe(expectedCount);
          }

          // Verify: check all expected opponent counts
          for (const [key, expectedCount] of expectedOpponents) {
            const [p1, p2] = key.split('|');
            const history = repo.getPairingHistory(sessionId, p1, p2);
            expect(history).toBeDefined();
            expect(history!.times_as_opponents).toBe(expectedCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 4.1, 4.2**
  it('pairs not involved in any match have zero teammate and opponent counts', () => {
    fc.assert(
      fc.property(
        // Generate 6-8 players and 1-4 matches using only a subset
        fc.integer({ min: 6, max: 8 }),
        fc.array(
          fc.record({
            winningTeam: fc.constantFrom('team1' as const, 'team2' as const),
          }),
          { minLength: 1, maxLength: 4 }
        ),
        (numPlayers, matchSpecs) => {
          const sessionId = uuidv4();
          insertSession(sessionId);
          const playerIds = createPlayersForSession(sessionId, numPlayers);

          // Only use the first 4 players in all matches
          const matchPlayerIds: [string, string, string, string] = [
            playerIds[0],
            playerIds[1],
            playerIds[2],
            playerIds[3],
          ];

          for (const spec of matchSpecs) {
            const matchId = createMatchDirectly(sessionId, matchPlayerIds);
            recordMatchResult({
              matchId,
              sessionId,
              winningTeam: spec.winningTeam,
            });
          }

          // Players 4+ were never in any match, so any pair involving only
          // players from index 4+ should have no pairing history
          for (let i = 4; i < numPlayers; i++) {
            for (let j = i + 1; j < numPlayers; j++) {
              const [p1, p2] = playerIds[i] < playerIds[j]
                ? [playerIds[i], playerIds[j]]
                : [playerIds[j], playerIds[i]];
              const history = repo.getPairingHistory(sessionId, p1, p2);
              // Should be undefined (no record) or have zero counts
              if (history) {
                expect(history.times_as_teammates).toBe(0);
                expect(history.times_as_opponents).toBe(0);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 4.1, 4.2**
  it('teammate count for a pair equals number of matches where they were on the same team', () => {
    fc.assert(
      fc.property(
        // Generate a sequence of matches where we track a specific pair
        fc.array(
          fc.record({
            // Whether the tracked pair is on the same team in this match
            pairOnSameTeam: fc.boolean(),
            winningTeam: fc.constantFrom('team1' as const, 'team2' as const),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (matchSpecs) => {
          const sessionId = uuidv4();
          insertSession(sessionId);
          // Create 6 players - we'll track the pair (player0, player1)
          const playerIds = createPlayersForSession(sessionId, 6);

          const trackedA = playerIds[0];
          const trackedB = playerIds[1];
          let expectedTeammateCount = 0;
          let expectedOpponentCount = 0;

          for (const spec of matchSpecs) {
            let matchPlayerIds: [string, string, string, string];

            if (spec.pairOnSameTeam) {
              // Put tracked pair on team 1 together
              matchPlayerIds = [trackedA, trackedB, playerIds[2], playerIds[3]];
              expectedTeammateCount++;
            } else {
              // Put tracked pair on opposing teams
              matchPlayerIds = [trackedA, playerIds[2], trackedB, playerIds[3]];
              expectedOpponentCount++;
            }

            const matchId = createMatchDirectly(sessionId, matchPlayerIds);
            recordMatchResult({
              matchId,
              sessionId,
              winningTeam: spec.winningTeam,
            });
          }

          // Verify the tracked pair's counts
          const [p1, p2] = trackedA < trackedB ? [trackedA, trackedB] : [trackedB, trackedA];
          const history = repo.getPairingHistory(sessionId, p1, p2);
          expect(history).toBeDefined();
          expect(history!.times_as_teammates).toBe(expectedTeammateCount);
          expect(history!.times_as_opponents).toBe(expectedOpponentCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================
// Score Validation, Formatting, and Winner Derivation Tests (Task 8.2)
// ============================================================

import { validateScores, formatMatchScore } from './matchResultService';

describe('validateScores', () => {
  it('returns valid with team1 as winner when team1Score > team2Score', () => {
    const result = validateScores(11, 7);
    expect(result).toEqual({ valid: true, winner: 'team1' });
  });

  it('returns valid with team2 as winner when team2Score > team1Score', () => {
    const result = validateScores(5, 11);
    expect(result).toEqual({ valid: true, winner: 'team2' });
  });

  it('rejects equal scores with error message', () => {
    const result = validateScores(7, 7);
    expect(result).toEqual({ valid: false, error: 'Scores cannot be tied' });
  });

  it('rejects negative team1Score', () => {
    const result = validateScores(-1, 5);
    expect(result).toEqual({ valid: false, error: 'Scores must be non-negative integers' });
  });

  it('rejects negative team2Score', () => {
    const result = validateScores(5, -3);
    expect(result).toEqual({ valid: false, error: 'Scores must be non-negative integers' });
  });

  it('rejects non-integer team1Score', () => {
    const result = validateScores(5.5, 3);
    expect(result).toEqual({ valid: false, error: 'Scores must be non-negative integers' });
  });

  it('rejects non-integer team2Score', () => {
    const result = validateScores(5, 3.7);
    expect(result).toEqual({ valid: false, error: 'Scores must be non-negative integers' });
  });

  it('accepts zero as a valid score', () => {
    const result = validateScores(11, 0);
    expect(result).toEqual({ valid: true, winner: 'team1' });
  });

  it('accepts zero for team1 and positive for team2', () => {
    const result = validateScores(0, 5);
    expect(result).toEqual({ valid: true, winner: 'team2' });
  });
});

describe('formatMatchScore', () => {
  it('returns "No Score" when both scores are null', () => {
    expect(formatMatchScore(null, null)).toBe('No Score');
  });

  it('returns "No Score" when team1Score is null', () => {
    expect(formatMatchScore(null, 7)).toBe('No Score');
  });

  it('returns "No Score" when team2Score is null', () => {
    expect(formatMatchScore(11, null)).toBe('No Score');
  });

  it('formats with higher score first (team1 wins)', () => {
    expect(formatMatchScore(11, 7)).toBe('11-7');
  });

  it('formats with higher score first (team2 wins)', () => {
    expect(formatMatchScore(5, 11)).toBe('11-5');
  });

  it('formats equal scores (edge case)', () => {
    expect(formatMatchScore(7, 7)).toBe('7-7');
  });

  it('formats with zero score', () => {
    expect(formatMatchScore(11, 0)).toBe('11-0');
  });
});

describe('recordMatchResult with scores', () => {
  let courtCounter: number;

  beforeEach(() => {
    cleanupDb();
    getDb();
    courtCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  function insertSession(id: string, courtCount = 100) {
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

  function createPlayersForSession(sessionId: string, count: number): string[] {
    const playerIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const player = addPlayer(sessionId, `Player${i + 1}`);
      playerIds.push(player.id);
    }
    return playerIds;
  }

  function createMatchDirectly(sessionId: string, playerIds: string[]): string {
    courtCounter++;
    const matchId = uuidv4();
    repo.createMatch({
      id: matchId,
      session_id: sessionId,
      court_number: courtCounter,
      player_ids: JSON.stringify(playerIds),
      status: 'active',
      started_at: new Date().toISOString(),
      completed_at: null,
    });
    return matchId;
  }

  it('derives winner from scores and persists them', () => {
    const sessionId = uuidv4();
    insertSession(sessionId);
    const playerIds = createPlayersForSession(sessionId, 4);
    const matchId = createMatchDirectly(sessionId, playerIds);

    const result = recordMatchResult({
      matchId,
      sessionId,
      winningTeam: 'team1', // will be overridden by scores
      team1Score: 11,
      team2Score: 7,
    });

    // Winner should be team1 (higher score)
    expect(result.winnerPlayerIds).toEqual([playerIds[0], playerIds[1]]);
    expect(result.loserPlayerIds).toEqual([playerIds[2], playerIds[3]]);

    // Verify scores are persisted
    const dbResult = repo.getMatchResultByMatchId(matchId);
    expect(dbResult).toBeDefined();
    expect(dbResult!.team1_score).toBe(11);
    expect(dbResult!.team2_score).toBe(7);
  });

  it('derives team2 as winner when team2Score is higher', () => {
    const sessionId = uuidv4();
    insertSession(sessionId);
    const playerIds = createPlayersForSession(sessionId, 4);
    const matchId = createMatchDirectly(sessionId, playerIds);

    const result = recordMatchResult({
      matchId,
      sessionId,
      winningTeam: 'team1', // will be overridden
      team1Score: 5,
      team2Score: 11,
    });

    // Winner should be team2 (higher score)
    expect(result.winnerPlayerIds).toEqual([playerIds[2], playerIds[3]]);
    expect(result.loserPlayerIds).toEqual([playerIds[0], playerIds[1]]);
  });

  it('persists null scores when scores are not provided', () => {
    const sessionId = uuidv4();
    insertSession(sessionId);
    const playerIds = createPlayersForSession(sessionId, 4);
    const matchId = createMatchDirectly(sessionId, playerIds);

    recordMatchResult({
      matchId,
      sessionId,
      winningTeam: 'team1',
    });

    const dbResult = repo.getMatchResultByMatchId(matchId);
    expect(dbResult!.team1_score).toBeNull();
    expect(dbResult!.team2_score).toBeNull();
  });

  it('throws ValidationError for equal scores', () => {
    const sessionId = uuidv4();
    insertSession(sessionId);
    const playerIds = createPlayersForSession(sessionId, 4);
    const matchId = createMatchDirectly(sessionId, playerIds);

    expect(() =>
      recordMatchResult({
        matchId,
        sessionId,
        winningTeam: 'team1',
        team1Score: 7,
        team2Score: 7,
      })
    ).toThrow('Scores cannot be tied');
  });

  it('throws ValidationError for negative scores', () => {
    const sessionId = uuidv4();
    insertSession(sessionId);
    const playerIds = createPlayersForSession(sessionId, 4);
    const matchId = createMatchDirectly(sessionId, playerIds);

    expect(() =>
      recordMatchResult({
        matchId,
        sessionId,
        winningTeam: 'team1',
        team1Score: -1,
        team2Score: 5,
      })
    ).toThrow('Scores must be non-negative integers');
  });
});

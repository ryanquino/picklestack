import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import * as courtService from './courtService';
import type {
  MLPTournamentConfig,
  TournamentTeam,
  TournamentBracket,
  MLPTeamMatchResult,
  MLPSubGameResult,
} from '../types';

// ============================================================
// Team Management
// ============================================================

/**
 * Create a tournament team manually.
 */
export function createTeam(
  sessionId: string,
  name: string,
  playerIds: [string, string, string, string],
  seed: number
): TournamentTeam {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  // Validate gender distribution: player1/2 must be male, player3/4 must be female
  for (let i = 0; i < 2; i++) {
    const p = db.prepare('SELECT gender FROM players WHERE id = ?').get(playerIds[i]) as any;
    if (!p || p.gender !== 'male') throw new Error(`Player ${i + 1} must be male`);
  }
  for (let i = 2; i < 4; i++) {
    const p = db.prepare('SELECT gender FROM players WHERE id = ?').get(playerIds[i]) as any;
    if (!p || p.gender !== 'female') throw new Error(`Player ${i + 1} must be female`);
  }

  db.prepare(`
    INSERT INTO tournament_teams (id, session_id, name, player1_id, player2_id, player3_id, player4_id, seed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, name, playerIds[0], playerIds[1], playerIds[2], playerIds[3], seed, now);

  return {
    id,
    sessionId,
    name,
    player1Id: playerIds[0],
    player2Id: playerIds[1],
    player3Id: playerIds[2],
    player4Id: playerIds[3],
    seed,
    createdAt: now,
  };
}

/**
 * Create teams by randomizing from a pool of male and female players.
 */
export function createTeamsRandom(
  sessionId: string,
  teamCount: number,
  malePlayerIds: string[],
  femalePlayerIds: string[]
): TournamentTeam[] {
  // Shuffle both pools
  const shuffledMales = [...malePlayerIds].sort(() => Math.random() - 0.5);
  const shuffledFemales = [...femalePlayerIds].sort(() => Math.random() - 0.5);

  const teamsNeeded = teamCount;
  const playersNeeded = teamsNeeded * 4;
  const malesNeeded = teamsNeeded * 2;
  const femalesNeeded = teamsNeeded * 2;

  if (shuffledMales.length < malesNeeded || shuffledFemales.length < femalesNeeded) {
    throw new Error(
      `Not enough players: need ${malesNeeded} male and ${femalesNeeded} female players for ${teamsNeeded} teams, but have ${shuffledMales.length} male and ${shuffledFemales.length} female`
    );
  }

  const teams: TournamentTeam[] = [];
  const db = getDb();
  const now = new Date().toISOString();

  for (let i = 0; i < teamsNeeded; i++) {
    const id = uuidv4();
    const p1 = shuffledMales[i * 2];
    const p2 = shuffledMales[i * 2 + 1];
    const p3 = shuffledFemales[i * 2];
    const p4 = shuffledFemales[i * 2 + 1];
    const teamName = `Team ${i + 1}`;

    db.prepare(`
      INSERT INTO tournament_teams (id, session_id, name, player1_id, player2_id, player3_id, player4_id, seed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, teamName, p1, p2, p3, p4, i + 1, now);

    teams.push({
      id,
      sessionId,
      name: teamName,
      player1Id: p1,
      player2Id: p2,
      player3Id: p3,
      player4Id: p4,
      seed: i + 1,
      createdAt: now,
    });
  }

  return teams;
}

/**
 * Get all teams for a session.
 */
export function getTeams(sessionId: string): TournamentTeam[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM tournament_teams WHERE session_id = ? ORDER BY seed ASC'
  ).all(sessionId) as any[];

  return rows.map(rowToTeam);
}

/**
 * Get a team by ID.
 */
export function getTeam(teamId: string): TournamentTeam | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tournament_teams WHERE id = ?').get(teamId) as any;
  return row ? rowToTeam(row) : null;
}

/**
 * Update a team's name or players.
 */
export function updateTeam(
  teamId: string,
  updates: { name?: string; playerIds?: [string, string, string, string] }
): TournamentTeam | null {
  const db = getDb();
  const existing = getTeam(teamId);
  if (!existing) return null;

  const name = updates.name ?? existing.name;
  const p1 = updates.playerIds?.[0] ?? existing.player1Id;
  const p2 = updates.playerIds?.[1] ?? existing.player2Id;
  const p3 = updates.playerIds?.[2] ?? existing.player3Id;
  const p4 = updates.playerIds?.[3] ?? existing.player4Id;

  db.prepare(`
    UPDATE tournament_teams SET name = ?, player1_id = ?, player2_id = ?, player3_id = ?, player4_id = ?
    WHERE id = ?
  `).run(name, p1, p2, p3, p4, teamId);

  return getTeam(teamId);
}

/**
 * Delete all teams for a session.
 */
export function deleteTeams(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM tournament_brackets WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM mlp_match_results WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM tournament_teams WHERE session_id = ?').run(sessionId);
}

/**
 * Delete a single team by ID. Clears bracket/match data if a bracket exists.
 */
export function deleteTeam(teamId: string): void {
  const db = getDb();
  const team = db.prepare('SELECT * FROM tournament_teams WHERE id = ?').get(teamId) as any;
  if (!team) throw new Error('Team not found');

  // If bracket exists, deleting teams invalidates the bracket — clear it
  db.prepare('DELETE FROM tournament_brackets WHERE session_id = ?').run(team.session_id);
  db.prepare('DELETE FROM mlp_match_results WHERE session_id = ?').run(team.session_id);
  db.prepare('DELETE FROM tournament_teams WHERE id = ?').run(teamId);

  // Re-seed remaining teams
  const remaining = db.prepare('SELECT id FROM tournament_teams WHERE session_id = ? ORDER BY seed').all(team.session_id) as any[];
  const stmt = db.prepare('UPDATE tournament_teams SET seed = ? WHERE id = ?');
  remaining.forEach((r, i) => stmt.run(i + 1, r.id));
}

// ============================================================
// Bracket Generation
// ============================================================

/**
 * Next power of two >= n.
 */
function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Get round name from round number and total rounds.
 */
function getRoundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round;
  if (remaining <= 1) return 'Final';
  if (remaining === 2) return 'Semifinals';
  if (remaining === 3) return 'Quarterfinals';
  return `Round ${round + 1}`;
}

/**
 * Generate a single-elimination bracket where every team plays in round 1.
 *
 * Round 1: all teams paired (1vN, 2vN-1, ...) — no byes.
 * Round 2+: standard bracket padded to next power of two with byes as needed.
 */
export function generateBracket(sessionId: string, teamIds: string[]): TournamentBracket[] {
  const db = getDb();
  const now = new Date().toISOString();
  const teamCount = teamIds.length;

  if (teamCount < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  // Clear existing bracket for this session
  db.prepare('DELETE FROM tournament_brackets WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM mlp_match_results WHERE session_id = ?').run(sessionId);

  const brackets: TournamentBracket[] = [];

  // #1 seed (first in list) gets the BYE if odd team count
  // Remaining teams are shuffled for random matchups
  const seed1 = teamIds[0];
  const remainingTeams = [...teamIds].slice(1).sort(() => Math.random() - 0.5);

  // ---- 3-team format: SF1 (2 teams), SF2 (1 team waiting for SF1 loser), Final ----
  if (teamCount === 3) {
    // #1 seed goes to SF2 (auto-advances), the other two play SF1
    const byeTeam = seed1;
    const sf1Teams = remainingTeams;
    // SF1: two random teams
    const sf1Id = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sf1Id, sessionId, 0, 'Semifinals', 0, sf1Teams[0], sf1Teams[1], null, null, 0, now);
    brackets.push({
      id: sf1Id, sessionId, round: 0, roundName: 'Semifinals',
      matchIndex: 0, teamAId: sf1Teams[0], teamBId: sf1Teams[1],
      winnerTeamId: null, matchId: null, isBye: false, createdAt: now,
    });

    // SF2: #1 seed (waiting for SF1 loser to fill empty slot)
    const sf2Id = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sf2Id, sessionId, 0, 'Semifinals', 1, byeTeam, null, null, null, 0, now);
    brackets.push({
      id: sf2Id, sessionId, round: 0, roundName: 'Semifinals',
      matchIndex: 1, teamAId: byeTeam, teamBId: null,
      winnerTeamId: null, matchId: null, isBye: false, createdAt: now,
    });

    // Final: empty (filled by winners of SF1 and SF2)
    const finalId = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(finalId, sessionId, 1, 'Final', 0, null, null, null, null, 0, now);
    brackets.push({
      id: finalId, sessionId, round: 1, roundName: 'Final',
      matchIndex: 0, teamAId: null, teamBId: null,
      winnerTeamId: null, matchId: null, isBye: false, createdAt: now,
    });

    return getBrackets(sessionId);
  }

  // ---- 4-team format: SF1 + SF2 (both 2 teams), Final, Third Place ----
  if (teamCount === 4) {
    // All 4 teams shuffled for random SF matchups (no bye for 4 teams)
    const allTeamsShuffled = [...teamIds].sort(() => Math.random() - 0.5);
    // SF1: two random teams
    const sf1Id = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sf1Id, sessionId, 0, 'Semifinals', 0, allTeamsShuffled[0], allTeamsShuffled[1], null, null, 0, now);
    brackets.push({
      id: sf1Id, sessionId, round: 0, roundName: 'Semifinals',
      matchIndex: 0, teamAId: allTeamsShuffled[0], teamBId: allTeamsShuffled[1],
      winnerTeamId: null, matchId: null, isBye: false, createdAt: now,
    });

    // SF2: other two random teams
    const sf2Id = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sf2Id, sessionId, 0, 'Semifinals', 1, allTeamsShuffled[2], allTeamsShuffled[3], null, null, 0, now);
    brackets.push({
      id: sf2Id, sessionId, round: 0, roundName: 'Semifinals',
      matchIndex: 1, teamAId: allTeamsShuffled[2], teamBId: allTeamsShuffled[3],
      winnerTeamId: null, matchId: null, isBye: false, createdAt: now,
    });

    // Final: empty (filled by winners of SF1 and SF2)
    const finalId = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(finalId, sessionId, 1, 'Final', 0, null, null, null, null, 0, now);
    brackets.push({
      id: finalId, sessionId, round: 1, roundName: 'Final',
      matchIndex: 0, teamAId: null, teamBId: null,
      winnerTeamId: null, matchId: null, isBye: false, createdAt: now,
    });

    return getBrackets(sessionId);
  }

  // ---- General format (5+ teams): standard single-elimination ----
  const round1MatchCount = Math.floor(teamCount / 2);
  const round1HasBye = teamCount % 2 === 1;

  // #1 seed gets the BYE if odd team count, otherwise all teams play round 1
  const byeTeam = round1HasBye ? seed1 : null;
  const playingTeams = round1HasBye ? remainingTeams : [...teamIds].sort(() => Math.random() - 0.5);

  // Create round 1 matches (random matchups — every team plays)
  for (let m = 0; m < round1MatchCount; m++) {
    const teamA = playingTeams[m];
    const teamB = playingTeams[m + round1MatchCount];

    const id = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, 0, 'Round 1', m, teamA, teamB, null, null, 0, now);

    brackets.push({
      id, sessionId, round: 0, roundName: 'Round 1',
      matchIndex: m, teamAId: teamA, teamBId: teamB,
      winnerTeamId: null, matchId: null, isBye: false, createdAt: now,
    });
  }

  // If odd team count, #1 seed gets a bye in round 1
  if (round1HasBye && byeTeam) {
    const byeTeamId = byeTeam;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, 0, 'Round 1', round1MatchCount, byeTeamId, null, byeTeamId, null, 1, now);

    brackets.push({
      id, sessionId, round: 0, roundName: 'Round 1',
      matchIndex: round1MatchCount, teamAId: byeTeamId, teamBId: null,
      winnerTeamId: byeTeamId, matchId: null, isBye: true, createdAt: now,
    });
  }

  return getBrackets(sessionId);
}

/**
 * Start the next round of the tournament.
 * Called after the current round is complete. Creates the next round's matches
 * with byes awarded to the highest point-differential teams.
 */
export function startNextRound(sessionId: string): TournamentBracket[] {
  const db = getDb();
  const brackets = getBrackets(sessionId);

  if (brackets.length === 0) throw new Error('No bracket exists');

  // Find highest round with matches.
  // The Third Place match is stored at round 99 — exclude it from round
  // calculations so it doesn't get treated as the latest competitive round.
  const COMPETITIVE_ROUNDS = brackets.filter(b => b.round !== 99);
  const maxRound = Math.max(...COMPETITIVE_ROUNDS.map(b => b.round));
  const currentRoundBrackets = brackets.filter(b => b.round === maxRound);

  // Check if current round is complete (all matches have winners)
  const incomplete = currentRoundBrackets.filter(b => !b.winnerTeamId && !b.isBye);
  if (incomplete.length > 0) {
    throw new Error('Current round is not complete yet');
  }

  // Check if next round already exists
  const existingNext = brackets.find(b => b.round === maxRound + 1);
  if (existingNext) {
    throw new Error('Next round already exists');
  }

  // Collect winners from current round, maintaining match index order
  // This preserves the bracket tree structure
  const currentRoundSorted = currentRoundBrackets.sort((a, b) => a.matchIndex - b.matchIndex);
  const winners: string[] = [];
  for (const b of currentRoundSorted) {
    if (b.winnerTeamId && !winners.includes(b.winnerTeamId)) {
      winners.push(b.winnerTeamId);
    }
  }

  if (winners.length < 2) throw new Error('Not enough winners to form a round');

  // Calculate point differential for each winner
  const allResults = getAllMLPMatchResults(sessionId);
  const pointDiff = new Map<string, number>();
  for (const r of allResults) {
    const diff = r.totalScoreA - r.totalScoreB;
    pointDiff.set(r.teamAId, (pointDiff.get(r.teamAId) ?? 0) + diff);
    pointDiff.set(r.teamBId, (pointDiff.get(r.teamBId) ?? 0) - diff);
  }
  function getPd(teamId: string): number {
    return pointDiff.get(teamId) ?? 0;
  }

  // Determine next round structure from the ACTUAL current round matches
  const nextRound = maxRound + 1;
  const winnerCount = winners.length;
  const maxMatchIndex = Math.max(...currentRoundBrackets.map(b => b.matchIndex));
  const matchesInRound = Math.floor(maxMatchIndex / 2) + 1;
  const bracketSize = nextPowerOfTwo(winnerCount);
  const totalRounds = maxRound + 1 + Math.log2(bracketSize);
  const nextRoundName = getRoundName(nextRound, totalRounds);
  const now = new Date().toISOString();

  // Create EMPTY bracket slots — we'll fill them from previous round results
  // preserving the correct bracket tree pairings.
  for (let i = 0; i < matchesInRound; i++) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, nextRound, nextRoundName, i, null, null, null, null, 0, now);
  }

  // FIRST: Propagate winners from previous round to their correct bracket tree positions
  propagateByeWinners(sessionId);

  // SECOND: Award byes to the highest point-differential winners.
  // After propagation, an odd winner count leaves one winner as a single-team
  // slot that gets auto-advanced as a bye (see propagateByeWinners). That team
  // is whichever winner landed last by match index — not necessarily the
  // highest PD. Reassign the bye to the highest-PD winner so the strongest
  // team gets the rest.
  const nextRoundBracketsAfterProp = getBrackets(sessionId)
    .filter(b => b.round === nextRound)
    .sort((a, b) => a.matchIndex - b.matchIndex);

  const teamsInRound = new Set<string>();
  for (const b of nextRoundBracketsAfterProp) {
    if (b.teamAId) teamsInRound.add(b.teamAId);
    if (b.teamBId) teamsInRound.add(b.teamBId);
  }

  // Winners eligible for a bye, highest PD first
  const byeCandidates = [...winners].sort((a, b) => getPd(b) - getPd(a));

  // 1) Fully empty slots (no team at all) → assign the highest-PD candidate directly
  const emptySlots = nextRoundBracketsAfterProp.filter(b => !b.teamAId && !b.teamBId);
  for (const slot of emptySlots) {
    const cand = byeCandidates.find(w => !teamsInRound.has(w));
    if (!cand) break;
    db.prepare(`
      UPDATE tournament_brackets
      SET team_a_id = ?, winner_team_id = ?, is_bye = 1
      WHERE id = ?
    `).run(cand, cand, slot.id);
    teamsInRound.add(cand);
  }

  // 2) Existing single-team bye slots → ensure they hold the highest-PD winner.
  // Move the desired bye winner into the bye slot and displace the previous
  // bye team into the desired winner's former match slot (keeping the match valid).
  const byeSlots = getBrackets(sessionId)
    .filter(b => b.round === nextRound && b.isBye);

  for (const byeSlot of byeSlots) {
    const desired = byeCandidates.find(w => w !== byeSlot.teamAId && teamsInRound.has(w));
    if (!desired || desired === byeSlot.teamAId) continue;

    const holder = nextRoundBracketsAfterProp.find(
      b => !b.isBye && (b.teamAId === desired || b.teamBId === desired)
    );
    if (!holder) continue;

    const displaced = byeSlot.teamAId!;
    const holderCol = holder.teamAId === desired ? 'team_a_id' : 'team_b_id';

    db.prepare(`
      UPDATE tournament_brackets
      SET team_a_id = ?, winner_team_id = ?, is_bye = 1
      WHERE id = ?
    `).run(desired, desired, byeSlot.id);

    db.prepare(`UPDATE tournament_brackets SET ${holderCol} = ? WHERE id = ?`)
      .run(displaced, holder.id);
  }

  return getBrackets(sessionId);
}

/**
 * Propagate bye winners to the next round slots.
 */
function propagateByeWinners(sessionId: string): void {
  const db = getDb();

  // Re-run until no more single-team byes need propagation
  let changed = true;
  while (changed) {
    changed = false;
    const brackets = getBrackets(sessionId);

    // Group by round
    const rounds = new Map<number, TournamentBracket[]>();
    for (const b of brackets) {
      if (!rounds.has(b.round)) rounds.set(b.round, []);
      rounds.get(b.round)!.push(b);
    }

    const sortedRounds = [...rounds.keys()].sort((a, b) => a - b);

    // Propagate winners from current round to next
    for (let ri = 0; ri < sortedRounds.length - 1; ri++) {
      const roundNum = sortedRounds[ri];
      const nextRound = sortedRounds[ri + 1];
      const currentRoundBrackets = rounds.get(roundNum)!.sort((a, b) => a.matchIndex - b.matchIndex);
      const nextRoundBrackets = rounds.get(nextRound)!.sort((a, b) => a.matchIndex - b.matchIndex);

      for (const bracket of currentRoundBrackets) {
        if (!bracket.winnerTeamId) continue;

        const nextBracket = nextRoundBrackets[Math.floor(bracket.matchIndex / 2)];
        if (!nextBracket) continue;

        const isTopHalf = bracket.matchIndex % 2 === 0;
        const updateCol = isTopHalf ? 'team_a_id' : 'team_b_id';

        // Only update if the slot is empty (or null)
        const currentVal = isTopHalf ? nextBracket.teamAId : nextBracket.teamBId;
        if (!currentVal) {
          db.prepare(`UPDATE tournament_brackets SET ${updateCol} = ? WHERE id = ?`)
            .run(bracket.winnerTeamId, nextBracket.id);
          changed = true;
        }
      }
    }

    // Auto-advance single-team brackets as byes, BUT only if the previous round
    // has no pending matches that could still propagate a team into this bracket.
    const updatedBrackets = getBrackets(sessionId);
    const updatedRounds = new Map<number, TournamentBracket[]>();
    for (const b of updatedBrackets) {
      if (!updatedRounds.has(b.round)) updatedRounds.set(b.round, []);
      updatedRounds.get(b.round)!.push(b);
    }

    for (const bracket of updatedBrackets) {
      if (bracket.winnerTeamId || bracket.isBye) continue;
      if (!bracket.teamAId && !bracket.teamBId) continue; // empty bracket, skip

      const hasOneTeam = (bracket.teamAId && !bracket.teamBId) || (!bracket.teamAId && bracket.teamBId);
      if (!hasOneTeam) continue;

      // Don't auto-advance single-team semifinal brackets — they are waiting
      // for the loser of the other semifinal match (3-team format)
      if (bracket.roundName === 'Semifinals') continue;

      // Check if the previous round still has unresolved matches that could fill this bracket
      const prevRound = bracket.round - 1;
      const prevRoundBrackets = updatedRounds.get(prevRound);
      if (prevRoundBrackets) {
        const hasPending = prevRoundBrackets.some(pb =>
          pb.winnerTeamId === null && !pb.isBye && (pb.teamAId || pb.teamBId)
        );
        if (hasPending) continue; // previous round not done — don't auto-advance yet
      }

      // Safe to auto-advance
      const teamId = bracket.teamAId || bracket.teamBId;
      db.prepare('UPDATE tournament_brackets SET winner_team_id = ?, is_bye = 1 WHERE id = ?')
        .run(teamId, bracket.id);
      changed = true;
    }
  }
}

// ============================================================
// Bracket Queries
// ============================================================

/**
 * Get all brackets for a session, sorted by round then match index.
 */
export function getBrackets(sessionId: string): TournamentBracket[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM tournament_brackets WHERE session_id = ? ORDER BY round ASC, match_index ASC'
  ).all(sessionId) as any[];

  return rows.map(rowToBracket);
}

/**
 * Get brackets for a specific round.
 */
export function getBracketsByRound(sessionId: string, round: number): TournamentBracket[] {
  return getBrackets(sessionId).filter(b => b.round === round);
}

/**
 * Get the next match to schedule (first bracket with both teams but no match).
 */
export function getNextMatch(sessionId: string): TournamentBracket | null {
  const brackets = getBrackets(sessionId);
  // Find first bracket that has both teams but no match and no winner
  return brackets.find(b => b.teamAId && b.teamBId && !b.matchId && !b.winnerTeamId && !b.isBye) ?? null;
}

/**
 * Get active matches (brackets with started matches).
 */
export function getActiveBrackets(sessionId: string): TournamentBracket[] {
  return getBrackets(sessionId).filter(b => b.matchId && !b.winnerTeamId);
}

/**
 * Check if the tournament is complete (final has a winner).
 */
export function isTournamentComplete(sessionId: string): boolean {
  const brackets = getBrackets(sessionId);
  const finalMatch = brackets.find(b => b.roundName === 'Final' && b.matchIndex === 0);
  return finalMatch?.winnerTeamId != null;
}

/**
 * Get the tournament champion.
 */
export function getChampion(sessionId: string): TournamentTeam | null {
  const brackets = getBrackets(sessionId);
  const finalMatch = brackets.find(b => b.roundName === 'Final' && b.matchIndex === 0);
  if (!finalMatch?.winnerTeamId) return null;
  return getTeam(finalMatch.winnerTeamId);
}

// ============================================================
// Match Completion & Advancement
// ============================================================

/**
 * Record an MLP team match result and advance the winner in the bracket.
 */
export function completeMLPMatch(
  matchId: string,
  bracketId: string,
  subGames: MLPSubGameResult[],
  winnerTeamId: string,
  dreamBreakerPlayed: boolean
): MLPTeamMatchResult {
  const db = getDb();
  const now = new Date().toISOString();

  const bracket = db.prepare('SELECT * FROM tournament_brackets WHERE id = ?').get(bracketId) as any;
  if (!bracket) throw new Error('Bracket not found');

  const teamAWins = subGames.filter(sg => sg.winningTeamId === bracket.team_a_id).length;
  const teamBWins = subGames.filter(sg => sg.winningTeamId === bracket.team_b_id).length;

  // Calculate total scores across all sub-games for point differential
  let totalScoreA = 0;
  let totalScoreB = 0;
  for (const sg of subGames) {
    if (sg.winningTeamId === bracket.team_a_id) {
      totalScoreA += sg.team1Score;
      totalScoreB += sg.team2Score;
    } else {
      totalScoreA += sg.team2Score;
      totalScoreB += sg.team1Score;
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO mlp_match_results (id, match_id, bracket_id, session_id, team_a_id, team_b_id, team_a_wins, team_b_wins, sub_games, winner_team_id, dream_breaker_played, total_score_a, total_score_b, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, matchId, bracketId, bracket.session_id,
    bracket.team_a_id, bracket.team_b_id,
    teamAWins, teamBWins,
    JSON.stringify(subGames), winnerTeamId,
    dreamBreakerPlayed ? 1 : 0, totalScoreA, totalScoreB, now
  );

  // Update bracket winner
  db.prepare('UPDATE tournament_brackets SET winner_team_id = ? WHERE id = ?')
    .run(winnerTeamId, bracketId);

  // Free the court by completing the underlying court match
  const matchRow = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as any;
  if (matchRow) {
    try {
      courtService.completeMatch(matchRow.session_id, matchRow.court_number, { skip: true });
    } catch { /* court may already be free */ }
  }

  // 3-team format: feed SF1 loser into SF2's empty slot
  if (bracket.round_name === 'Semifinals') {
    const allBrackets = getBrackets(bracket.session_id);
    const sfBrackets = allBrackets.filter(b => b.roundName === 'Semifinals');
    if (sfBrackets.length === 2) {
      const otherSF = sfBrackets.find(b => b.id !== bracketId);
      // Other SF has only one team (bye or waiting) — feed the loser in
      if (otherSF && otherSF.teamAId && !otherSF.teamBId) {
        const loserId = winnerTeamId === bracket.team_a_id ? bracket.team_b_id : bracket.team_a_id;
        if (loserId) {
          // Clear the bye and feed the loser
          db.prepare('UPDATE tournament_brackets SET team_b_id = ?, winner_team_id = NULL, is_bye = 0 WHERE id = ?')
            .run(loserId, otherSF.id);

          // Also clear any stale propagation from the bye into the next round
          const byeTeamId = otherSF.teamAId;
          const nextRound = otherSF.round + 1;
          const nextRoundBrackets = allBrackets.filter(b => b.round === nextRound);
          for (const next of nextRoundBrackets) {
            if (next.teamAId === byeTeamId) {
              db.prepare('UPDATE tournament_brackets SET team_a_id = NULL WHERE id = ?').run(next.id);
            }
            if (next.teamBId === byeTeamId) {
              db.prepare('UPDATE tournament_brackets SET team_b_id = NULL WHERE id = ?').run(next.id);
            }
          }
        }
      }
    }
  }

  // Propagate winner to next round
  propagateByeWinners(bracket.session_id);

  // Check if third-place match should be created
  checkThirdPlaceMatch(bracket.session_id);

  return {
    matchId,
    bracketId,
    teamAId: bracket.team_a_id,
    teamBId: bracket.team_b_id,
    teamAWins,
    teamBWins,
    subGames,
    winnerTeamId,
    dreamBreakerPlayed,
    totalScoreA,
    totalScoreB,
    completedAt: now,
  };
}

/**
 * Update a completed MLP match — change the winner and/or scores.
 * Re-propagates results through the bracket.
 */
export function updateMLPMatch(
  bracketId: string,
  subGames: MLPSubGameResult[],
  winnerTeamId: string,
  dreamBreakerPlayed: boolean
): MLPTeamMatchResult {
  const db = getDb();
  const now = new Date().toISOString();

  const bracket = db.prepare('SELECT * FROM tournament_brackets WHERE id = ?').get(bracketId) as any;
  if (!bracket) throw new Error('Bracket not found');

  const existing = db.prepare('SELECT * FROM mlp_match_results WHERE bracket_id = ?').get(bracketId) as any;
  if (!existing) throw new Error('No completed match found for this bracket');

  const teamAWins = subGames.filter(sg => sg.winningTeamId === bracket.team_a_id).length;
  const teamBWins = subGames.filter(sg => sg.winningTeamId === bracket.team_b_id).length;

  // Recalculate total scores
  let totalScoreA = 0;
  let totalScoreB = 0;
  for (const sg of subGames) {
    if (sg.winningTeamId === bracket.team_a_id) {
      totalScoreA += sg.team1Score;
      totalScoreB += sg.team2Score;
    } else {
      totalScoreA += sg.team2Score;
      totalScoreB += sg.team1Score;
    }
  }

  // Update the existing result
  db.prepare(`
    UPDATE mlp_match_results
    SET team_a_wins = ?, team_b_wins = ?, sub_games = ?, winner_team_id = ?,
        dream_breaker_played = ?, total_score_a = ?, total_score_b = ?, completed_at = ?
    WHERE bracket_id = ?
  `).run(
    teamAWins, teamBWins,
    JSON.stringify(subGames), winnerTeamId,
    dreamBreakerPlayed ? 1 : 0, totalScoreA, totalScoreB, now,
    bracketId
  );

  // Update bracket winner
  db.prepare('UPDATE tournament_brackets SET winner_team_id = ? WHERE id = ?')
    .run(winnerTeamId, bracketId);

  // 3-team format: re-feed SF loser into SF2's empty slot on update
  if (bracket.round_name === 'Semifinals') {
    const allBrackets = getBrackets(bracket.session_id);
    const sfBrackets = allBrackets.filter(b => b.roundName === 'Semifinals');
    if (sfBrackets.length === 2) {
      const otherSF = sfBrackets.find(b => b.id !== bracketId);
      if (otherSF && otherSF.teamAId && !otherSF.teamBId) {
        const loserId = winnerTeamId === bracket.team_a_id ? bracket.team_b_id : bracket.team_a_id;
        if (loserId) {
          db.prepare('UPDATE tournament_brackets SET team_b_id = ?, winner_team_id = NULL, is_bye = 0 WHERE id = ?')
            .run(loserId, otherSF.id);

          // Clear stale bye propagation from next round
          const byeTeamId = otherSF.teamAId;
          const nextRound = otherSF.round + 1;
          const nextRoundBrackets = allBrackets.filter(b => b.round === nextRound);
          for (const next of nextRoundBrackets) {
            if (next.teamAId === byeTeamId) {
              db.prepare('UPDATE tournament_brackets SET team_a_id = NULL WHERE id = ?').run(next.id);
            }
            if (next.teamBId === byeTeamId) {
              db.prepare('UPDATE tournament_brackets SET team_b_id = NULL WHERE id = ?').run(next.id);
            }
          }
        }
      }
    }
  }

  // Re-propagate from this bracket onward
  propagateByeWinners(bracket.session_id);

  return {
    matchId: existing.match_id,
    bracketId,
    teamAId: bracket.team_a_id,
    teamBId: bracket.team_b_id,
    teamAWins,
    teamBWins,
    subGames,
    winnerTeamId,
    dreamBreakerPlayed,
    totalScoreA,
    totalScoreB,
    completedAt: now,
  };
}

/**
 * Check if we should create a third-place match.
 * Called after each match completion.
 */
function checkThirdPlaceMatch(sessionId: string): void {
  const db = getDb();

  // Check if semifinal round exists
  const brackets = getBrackets(sessionId);
  const semifinalBrackets = brackets.filter(b => b.roundName === 'Semifinals' && !b.isBye);
  if (semifinalBrackets.length < 2) return;

  // Only create third-place match for 4-team format (both SFs have 2 real teams)
  const realSFMatches = semifinalBrackets.filter(b => b.teamAId && b.teamBId);
  if (realSFMatches.length < 2) return;

  // Check if third-place match already exists
  const existing = brackets.find(b => b.roundName === 'Third Place');
  if (existing) return;

  // Collect all semifinal losers (from completed semis with two real teams)
  const losers: string[] = [];
  for (const sf of realSFMatches) {
    if (sf.winnerTeamId && sf.teamAId && sf.teamBId) {
      const loserId = sf.winnerTeamId === sf.teamAId ? sf.teamBId! : sf.teamAId!;
      losers.push(loserId);
    }
  }

  // Need at least 2 losers to create a third-place match
  if (losers.length < 2) return;

  // In 3-team format, the same team can be the loser of both SFs (fed into SF2 then lost).
  // Don't create a third-place match — that team automatically gets 3rd place.
  if (losers[0] === losers[1]) return;

  const now = new Date().toISOString();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO tournament_brackets (id, session_id, round, round_name, match_index, team_a_id, team_b_id, winner_team_id, match_id, is_bye, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, 99, 'Third Place', 0, losers[0], losers[1], null, null, 0, now);
}

/**
 * Fix existing brackets where semifinal byes were auto-advanced before the
 * loser-feeding logic existed. If a SF has a completed match and the other
 * SF has only one team (bye), feed the loser in.
 * Returns true if any changes were made.
 */
export function fixSemifinalByes(sessionId: string): boolean {
  const db = getDb();
  const brackets = getBrackets(sessionId);
  const sfBrackets = brackets.filter(b => b.roundName === 'Semifinals' && !b.isBye);

  if (sfBrackets.length !== 2) return false;

  let changed = false;

  for (const sf of sfBrackets) {
    if (!sf.winnerTeamId || !sf.teamAId || !sf.teamBId) continue;

    const otherSF = sfBrackets.find(b => b.id !== sf.id);
    if (!otherSF || !otherSF.teamAId || otherSF.teamBId) continue;

    // This SF is completed and the other SF has only one team — feed the loser in
    const loserId = sf.winnerTeamId === sf.teamAId ? sf.teamBId : sf.teamAId;
    const byeTeamId = otherSF.teamAId;

    // Clear stale bye propagation from next round
    const nextRound = otherSF.round + 1;
    const nextRoundBrackets = brackets.filter(b => b.round === nextRound);
    for (const next of nextRoundBrackets) {
      if (next.teamAId === byeTeamId) {
        db.prepare('UPDATE tournament_brackets SET team_a_id = NULL WHERE id = ?').run(next.id);
        changed = true;
      }
      if (next.teamBId === byeTeamId) {
        db.prepare('UPDATE tournament_brackets SET team_b_id = NULL WHERE id = ?').run(next.id);
        changed = true;
      }
    }

    // Feed the loser into the other SF's empty slot
    db.prepare('UPDATE tournament_brackets SET team_b_id = ?, winner_team_id = NULL, is_bye = 0 WHERE id = ?')
      .run(loserId, otherSF.id);
    changed = true;
  }

  if (changed) {
    propagateByeWinners(sessionId);
    checkThirdPlaceMatch(sessionId);
  }

  return changed;
}

/**
 * Get MLP config for a session.
 */
export function getMLPConfig(sessionId: string): MLPTournamentConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT mlp_config FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!row?.mlp_config) return null;
  try {
    return JSON.parse(row.mlp_config);
  } catch {
    return null;
  }
}

/**
 * Get the MLP match result for a bracket.
 */
export function getMLPMatchResult(bracketId: string): MLPTeamMatchResult | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM mlp_match_results WHERE bracket_id = ?').get(bracketId) as any;
  if (!row) return null;

  return {
    matchId: row.match_id,
    bracketId: row.bracket_id,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    teamAWins: row.team_a_wins,
    teamBWins: row.team_b_wins,
    subGames: JSON.parse(row.sub_games),
    winnerTeamId: row.winner_team_id,
    dreamBreakerPlayed: row.dream_breaker_played === 1,
    totalScoreA: row.total_score_a ?? 0,
    totalScoreB: row.total_score_b ?? 0,
    completedAt: row.completed_at,
  };
}

/**
 * Get all MLP match results for a session.
 */
export function getAllMLPMatchResults(sessionId: string): MLPTeamMatchResult[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM mlp_match_results WHERE session_id = ? ORDER BY completed_at ASC').all(sessionId) as any[];
  return rows.map(row => ({
    matchId: row.match_id,
    bracketId: row.bracket_id,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    teamAWins: row.team_a_wins,
    teamBWins: row.team_b_wins,
    subGames: JSON.parse(row.sub_games),
    winnerTeamId: row.winner_team_id,
    dreamBreakerPlayed: row.dream_breaker_played === 1,
    totalScoreA: row.total_score_a ?? 0,
    totalScoreB: row.total_score_b ?? 0,
    completedAt: row.completed_at,
  }));
}

/**
 * Get final tournament rankings.
 */
export function getTournamentRankings(sessionId: string): Array<{ rank: number; team: TournamentTeam; pointDifferential: number }> {
  const brackets = getBrackets(sessionId);
  const allResults = getAllMLPMatchResults(sessionId);
  const results: Array<{ rank: number; team: TournamentTeam; pointDifferential: number }> = [];

  // Calculate point differential for each team across all matches
  const pointDiff = new Map<string, number>();
  for (const r of allResults) {
    const diff = r.totalScoreA - r.totalScoreB;
    pointDiff.set(r.teamAId, (pointDiff.get(r.teamAId) ?? 0) + diff);
    pointDiff.set(r.teamBId, (pointDiff.get(r.teamBId) ?? 0) - diff);
  }

  function getPd(teamId: string): number {
    return pointDiff.get(teamId) ?? 0;
  }

  const finalMatch = brackets.find(b => b.roundName === 'Final' && b.matchIndex === 0);

  if (finalMatch?.winnerTeamId) {
    const champion = getTeam(finalMatch.winnerTeamId);
    if (champion) results.push({ rank: 1, team: champion, pointDifferential: getPd(champion.id) });

    // Runner-up is the loser
    const runnerUpId = finalMatch.winnerTeamId === finalMatch.teamAId
      ? finalMatch.teamBId
      : finalMatch.teamAId;
    if (runnerUpId) {
      const runnerUp = getTeam(runnerUpId);
      if (runnerUp) results.push({ rank: 2, team: runnerUp, pointDifferential: getPd(runnerUp.id) });
    }
  }

  // Third place
  const thirdPlaceMatch = brackets.find(b => b.roundName === 'Third Place');
  if (thirdPlaceMatch?.winnerTeamId) {
    const third = getTeam(thirdPlaceMatch.winnerTeamId);
    if (third) results.push({ rank: 3, team: third, pointDifferential: getPd(third.id) });

    const fourthId = thirdPlaceMatch.winnerTeamId === thirdPlaceMatch.teamAId
      ? thirdPlaceMatch.teamBId
      : thirdPlaceMatch.teamAId;
    if (fourthId) {
      const fourth = getTeam(fourthId);
      if (fourth) results.push({ rank: 4, team: fourth, pointDifferential: getPd(fourth.id) });
    }
  } else if (finalMatch) {
    // No third-place match — determine 3rd place
    const semifinalBrackets = brackets.filter(b => b.roundName === 'Semifinals');

    // 3-team format: SF2 has 2 teams after loser is fed in — SF2 loser is 3rd
    const sfWith2Teams = semifinalBrackets.filter(b => b.teamAId && b.teamBId && !b.isBye);
    if (sfWith2Teams.length === 2) {
      // Check if one SF started with only 1 team (3-team format)
      // In 3-team format, one SF's loser feeds into the other, and the SF2 loser is 3rd
      // Both completed SFs with 2 teams — check which is SF2 (the one that received the loser)
      const completedSFs = sfWith2Teams.filter(b => b.winnerTeamId);
      if (completedSFs.length === 2) {
        // 4-team format: both SF losers play for 3rd (or 3-team format: same team lost both)
        const sfLosers: Array<{ team: TournamentTeam; pd: number }> = [];
        const seenLosers = new Set<string>();
        for (const sf of completedSFs) {
          const loserId = sf.winnerTeamId === sf.teamAId ? sf.teamBId : sf.teamAId;
          if (!loserId || seenLosers.has(loserId)) continue;
          seenLosers.add(loserId);
          const loser = getTeam(loserId);
          if (loser) sfLosers.push({ team: loser, pd: getPd(loser.id) });
        }
        sfLosers.sort((a, b) => b.pd - a.pd);
        for (const entry of sfLosers) {
          results.push({ rank: 3, team: entry.team, pointDifferential: entry.pd });
        }
      } else if (completedSFs.length === 1) {
        // 3-team format: one SF completed, loser fed into SF2, SF2 not yet completed
        // Once SF2 completes, its loser is 3rd
        const sf2 = sfWith2Teams.find(b =>
          completedSFs.some(c => c.matchIndex !== b.matchIndex)
        );
        if (sf2 && sf2.winnerTeamId) {
          const loserId = sf2.winnerTeamId === sf2.teamAId ? sf2.teamBId : sf2.teamAId;
          if (loserId) {
            const loser = getTeam(loserId);
            if (loser) results.push({ rank: 3, team: loser, pointDifferential: getPd(loser.id) });
          }
        }
      }
    } else if (sfWith2Teams.length === 1) {
      // 3-team format: only one SF has 2 teams so far (SF1 completed, loser fed into SF2)
      // The other SF started with 1 team and now has 2 but not yet completed
      // Once it completes, its loser is 3rd
      // But if the 1-team SF hasn't received its loser yet, we can't determine 3rd
    }

    // Fallback: semifinal losers ranked by point differential (general format)
    if (results.length < 3) {
      const sfLosers: Array<{ team: TournamentTeam; pd: number }> = [];
      for (const sf of semifinalBrackets) {
        if (sf.winnerTeamId && sf.teamAId && sf.teamBId) {
          const loserId = sf.winnerTeamId === sf.teamAId ? sf.teamBId : sf.teamAId;
          const loser = getTeam(loserId);
          if (loser && !results.some(r => r.team.id === loser.id)) {
            sfLosers.push({ team: loser, pd: getPd(loser.id) });
          }
        }
      }
      sfLosers.sort((a, b) => b.pd - a.pd);
      for (const entry of sfLosers) {
        results.push({ rank: 3, team: entry.team, pointDifferential: entry.pd });
      }
    }
  }

  return results;
}

// ============================================================
// Row Mappers
// ============================================================

function rowToTeam(row: any): TournamentTeam {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    player3Id: row.player3_id,
    player4Id: row.player4_id,
    seed: row.seed,
    createdAt: row.created_at,
  };
}

function rowToBracket(row: any): TournamentBracket {
  return {
    id: row.id,
    sessionId: row.session_id,
    round: row.round,
    roundName: row.round_name,
    matchIndex: row.match_index,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    winnerTeamId: row.winner_team_id,
    matchId: row.match_id,
    isBye: row.is_bye === 1,
    createdAt: row.created_at,
  };
}

import { getDb } from './db';

// ============================================================
// Raw database row types (strings for dates, JSON for arrays)
// ============================================================

export interface SessionRow {
  id: string;
  name: string;
  court_count: number;
  status: string;
  pairing_mode: string;
  court_name: string;
  court_names?: string;
  session_type: string;
  game_mode: string;
  matching_mode: string;
  session_duration_hours: number;
  mlp_config?: string | null;
  club_raid_config?: string | null;
  live_view_url: string;
  created_at: string;
  updated_at: string;
}

export interface PlayerRow {
  id: string;
  session_id: string;
  name: string;
  gender: string | null;
  checked_in_at: string;
}

export interface QueueEntryRow {
  player_id: string;
  session_id: string;
  position: number;
  pair_id?: string | null;
  queued_at?: string;
}

export interface FixedPairRow {
  id: string;
  session_id: string;
  player1_id: string;
  player2_id: string;
  created_at: string;
}

export interface MatchRow {
  id: string;
  session_id: string;
  court_number: number;
  player_ids: string; // JSON array
  status: string;
  started_at: string;
  completed_at: string | null;
  assigned_bracket: string | null; // 'winners' | 'losers' | null — comeback mode bracket assignment
}

export interface ClubRow {
  id: string;
  session_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface ClubMemberRow {
  id: string;
  club_id: string;
  player_id: string;
  joined_at: string;
}

export interface ClubRaidMatchRow {
  id: string;
  session_id: string;
  round: number;
  club_a_id: string;
  club_b_id: string;
  club_a_player_1: string | null;
  club_a_player_2: string | null;
  club_b_player_1: string | null;
  club_b_player_2: string | null;
  match_id: string | null;
  status: string;
  winner_club_id: string | null;
  created_at: string;
}

// ============================================================
// Session Repository
// ============================================================

export function createSession(session: SessionRow): SessionRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO sessions (id, name, court_count, status, pairing_mode, court_name, session_type, game_mode, matching_mode, session_duration_hours, mlp_config, club_raid_config, live_view_url, created_at, updated_at)
    VALUES (@id, @name, @court_count, @status, @pairing_mode, @court_name, @session_type, @game_mode, @matching_mode, @session_duration_hours, @mlp_config, @club_raid_config, @live_view_url, @created_at, @updated_at)
  `).run(session);
  return session;
}

export function getSessionById(id: string): SessionRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
}

// Temporary debug helper: list sessions. Pass `activeOnly=false` to include ended ones.
export function listSessions(activeOnly = true): SessionRow[] {
  const db = getDb();
  const sql = activeOnly
    ? `SELECT * FROM sessions WHERE status = 'active' ORDER BY updated_at DESC`
    : `SELECT * FROM sessions ORDER BY updated_at DESC`;
  return db.prepare(sql).all() as SessionRow[];
}

export function updateSession(id: string, updates: Partial<Pick<SessionRow, 'name' | 'status' | 'updated_at'>>): void {
  const db = getDb();
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  if (updates.name !== undefined) {
    setClauses.push('name = @name');
    params.name = updates.name;
  }
  if (updates.status !== undefined) {
    setClauses.push('status = @status');
    params.status = updates.status;
  }
  if (updates.updated_at !== undefined) {
    setClauses.push('updated_at = @updated_at');
    params.updated_at = updates.updated_at;
  }

  if (setClauses.length === 0) return;

  db.prepare(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
}

// ============================================================
// Player Repository
// ============================================================

export function createPlayer(player: PlayerRow): PlayerRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO players (id, session_id, name, gender, checked_in_at)
    VALUES (@id, @session_id, @name, @gender, @checked_in_at)
  `).run(player);
  return player;
}

export function getPlayerById(id: string): PlayerRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow | undefined;
}

export function getPlayersBySession(sessionId: string): PlayerRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM players WHERE session_id = ? ORDER BY checked_in_at').all(sessionId) as PlayerRow[];
}

export function findPlayerByNameCaseInsensitive(sessionId: string, name: string): PlayerRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM players WHERE session_id = ? AND LOWER(name) = LOWER(?)'
  ).get(sessionId, name) as PlayerRow | undefined;
}

export function deletePlayer(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM players WHERE id = ?').run(id);
}

// ============================================================
// Queue Entry Repository
// ============================================================

export function createQueueEntry(entry: QueueEntryRow): QueueEntryRow {
  const db = getDb();
  const row = { ...entry, pair_id: entry.pair_id ?? null, queued_at: entry.queued_at || new Date().toISOString() };
  db.prepare(`
    INSERT INTO queue_entries (player_id, session_id, position, pair_id, queued_at)
    VALUES (@player_id, @session_id, @position, @pair_id, @queued_at)
  `).run(row);
  return row;
}

export function getQueueEntryByPlayerId(playerId: string): QueueEntryRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM queue_entries WHERE player_id = ?').get(playerId) as QueueEntryRow | undefined;
}

export function getQueueBySession(sessionId: string): QueueEntryRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM queue_entries WHERE session_id = ? ORDER BY queued_at ASC'
  ).all(sessionId) as QueueEntryRow[];
}

export function updateQueueEntryPosition(playerId: string, position: number): void {
  const db = getDb();
  db.prepare('UPDATE queue_entries SET position = ? WHERE player_id = ?').run(position, playerId);
}

export function deleteQueueEntry(playerId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM queue_entries WHERE player_id = ?').run(playerId);
}

export function deleteQueueEntriesBySession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM queue_entries WHERE session_id = ?').run(sessionId);
}

export function getQueueEntryByPairId(pairId: string): QueueEntryRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM queue_entries WHERE pair_id = ?').get(pairId) as QueueEntryRow | undefined;
}

// ============================================================
// Fixed Pair Repository
// ============================================================

export function createFixedPair(pair: FixedPairRow): FixedPairRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO fixed_pairs (id, session_id, player1_id, player2_id, created_at)
    VALUES (@id, @session_id, @player1_id, @player2_id, @created_at)
  `).run(pair);
  return pair;
}

export function getFixedPairById(id: string): FixedPairRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM fixed_pairs WHERE id = ?').get(id) as FixedPairRow | undefined;
}

export function getFixedPairsBySession(sessionId: string): FixedPairRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM fixed_pairs WHERE session_id = ? ORDER BY created_at'
  ).all(sessionId) as FixedPairRow[];
}

export function getFixedPairByPlayerId(sessionId: string, playerId: string): FixedPairRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM fixed_pairs WHERE session_id = ? AND (player1_id = ? OR player2_id = ?)'
  ).get(sessionId, playerId, playerId) as FixedPairRow | undefined;
}

export function deleteFixedPair(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM fixed_pairs WHERE id = ?').run(id);
}

export function deleteFixedPairsBySession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM fixed_pairs WHERE session_id = ?').run(sessionId);
}

// ============================================================
// Match Repository
// ============================================================

export function createMatch(match: MatchRow): MatchRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO matches (id, session_id, court_number, player_ids, status, started_at, completed_at, assigned_bracket)
    VALUES (@id, @session_id, @court_number, @player_ids, @status, @started_at, @completed_at, @assigned_bracket)
  `).run(match);
  return match;
}

export function getMatchById(id: string): MatchRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
}

export function getMatchesBySession(sessionId: string): MatchRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM matches WHERE session_id = ? ORDER BY started_at').all(sessionId) as MatchRow[];
}

export function getActiveMatchByCourt(sessionId: string, courtNumber: number): MatchRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM matches WHERE session_id = ? AND court_number = ? AND status = ?'
  ).get(sessionId, courtNumber, 'active') as MatchRow | undefined;
}

export function getActiveMatchesBySession(sessionId: string): MatchRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM matches WHERE session_id = ? AND status = ? ORDER BY started_at'
  ).all(sessionId, 'active') as MatchRow[];
}

export function updateMatch(id: string, updates: Partial<Pick<MatchRow, 'status' | 'completed_at'>>): void {
  const db = getDb();
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  if (updates.status !== undefined) {
    setClauses.push('status = @status');
    params.status = updates.status;
  }
  if (updates.completed_at !== undefined) {
    setClauses.push('completed_at = @completed_at');
    params.completed_at = updates.completed_at;
  }

  if (setClauses.length === 0) return;

  db.prepare(`UPDATE matches SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
}

export function updateMatchPlayers(id: string, playerIds: string[]): void {
  const db = getDb();
  db.prepare('UPDATE matches SET player_ids = ? WHERE id = ?').run(JSON.stringify(playerIds), id);
}

export function getCompletedMatchCountBySession(sessionId: string): number {
  const db = getDb();
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM matches WHERE session_id = ? AND status = ?'
  ).get(sessionId, 'completed') as { count: number };
  return result.count;
}

// ============================================================
// Raw row types for new tables
// ============================================================

export interface MatchResultRow {
  id: string;
  match_id: string;
  session_id: string;
  winner_player_ids: string; // JSON array of 2 player IDs
  loser_player_ids: string;  // JSON array of 2 player IDs
  team1_score: number | null;
  team2_score: number | null;
  recorded_at: string;
  updated_at: string;
}

export interface PlayerRatingRow {
  player_id: string;
  session_id: string;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  star_rating: number;
  last_match_result: string | null;
}

export interface PairingHistoryRow {
  session_id: string;
  player1_id: string;
  player2_id: string;
  times_as_teammates: number;
  times_as_opponents: number;
}

// ============================================================
// Match Result Repository
// ============================================================

export function createMatchResult(result: MatchResultRow): MatchResultRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO match_results (id, match_id, session_id, winner_player_ids, loser_player_ids, team1_score, team2_score, recorded_at, updated_at)
    VALUES (@id, @match_id, @session_id, @winner_player_ids, @loser_player_ids, @team1_score, @team2_score, @recorded_at, @updated_at)
  `).run(result);
  return result;
}

export function getMatchResultById(id: string): MatchResultRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM match_results WHERE id = ?').get(id) as MatchResultRow | undefined;
}

export function getMatchResultByMatchId(matchId: string): MatchResultRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM match_results WHERE match_id = ?').get(matchId) as MatchResultRow | undefined;
}

export function getMatchResultsBySession(sessionId: string): MatchResultRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM match_results WHERE session_id = ? ORDER BY recorded_at'
  ).all(sessionId) as MatchResultRow[];
}

export function updateMatchResult(matchId: string, updates: { winner_player_ids: string; loser_player_ids: string; updated_at: string; team1_score?: number | null; team2_score?: number | null }): void {
  const db = getDb();
  db.prepare(`
    UPDATE match_results
    SET winner_player_ids = @winner_player_ids, loser_player_ids = @loser_player_ids, updated_at = @updated_at,
        team1_score = @team1_score, team2_score = @team2_score
    WHERE match_id = @match_id
  `).run({ match_id: matchId, ...updates });
}

export function deleteMatchResult(matchId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM match_results WHERE match_id = ?').run(matchId);
}

// ============================================================
// Player Rating Repository
// ============================================================

export function upsertPlayerRating(rating: PlayerRatingRow): PlayerRatingRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO player_ratings (player_id, session_id, rating, matches_played, wins, losses, star_rating)
    VALUES (@player_id, @session_id, @rating, @matches_played, @wins, @losses, @star_rating)
    ON CONFLICT(player_id, session_id) DO UPDATE SET
      rating = @rating,
      matches_played = @matches_played,
      wins = @wins,
      losses = @losses,
      star_rating = @star_rating
  `).run(rating);
  return rating;
}

export function getPlayerRating(playerId: string, sessionId: string): PlayerRatingRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM player_ratings WHERE player_id = ? AND session_id = ?'
  ).get(playerId, sessionId) as PlayerRatingRow | undefined;
}

export function getPlayerRatingsBySession(sessionId: string): PlayerRatingRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM player_ratings WHERE session_id = ?'
  ).all(sessionId) as PlayerRatingRow[];
}

export function updatePlayerRatingValues(
  playerId: string,
  sessionId: string,
  updates: { rating: number; matches_played: number; wins: number; losses: number; star_rating: number }
): void {
  const db = getDb();
  db.prepare(`
    UPDATE player_ratings
    SET rating = @rating, matches_played = @matches_played, wins = @wins, losses = @losses, star_rating = @star_rating
    WHERE player_id = @player_id AND session_id = @session_id
  `).run({ player_id: playerId, session_id: sessionId, ...updates });
}

export function updatePlayerLastResult(
  playerId: string,
  sessionId: string,
  result: 'win' | 'loss'
): void {
  const db = getDb();
  db.prepare(
    'UPDATE player_ratings SET last_match_result = ? WHERE player_id = ? AND session_id = ?'
  ).run(result, playerId, sessionId);
}

export function deletePlayerRating(playerId: string, sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM player_ratings WHERE player_id = ? AND session_id = ?').run(playerId, sessionId);
}

// ============================================================
// Pairing History Repository
// ============================================================

/**
 * Upsert pairing history between two players.
 * Player IDs should be ordered (player1_id < player2_id) for consistent lookups.
 */
export function upsertPairingHistory(entry: PairingHistoryRow): PairingHistoryRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO pairing_history (session_id, player1_id, player2_id, times_as_teammates, times_as_opponents)
    VALUES (@session_id, @player1_id, @player2_id, @times_as_teammates, @times_as_opponents)
    ON CONFLICT(session_id, player1_id, player2_id) DO UPDATE SET
      times_as_teammates = @times_as_teammates,
      times_as_opponents = @times_as_opponents
  `).run(entry);
  return entry;
}

/**
 * Increment the teammate count for a player pair.
 * Player IDs should be ordered (player1_id < player2_id) for consistent lookups.
 */
export function incrementTeammateCount(sessionId: string, player1Id: string, player2Id: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pairing_history (session_id, player1_id, player2_id, times_as_teammates, times_as_opponents)
    VALUES (@session_id, @player1_id, @player2_id, 1, 0)
    ON CONFLICT(session_id, player1_id, player2_id) DO UPDATE SET
      times_as_teammates = times_as_teammates + 1
  `).run({ session_id: sessionId, player1_id: player1Id, player2_id: player2Id });
}

/**
 * Increment the opponent count for a player pair.
 * Player IDs should be ordered (player1_id < player2_id) for consistent lookups.
 */
export function incrementOpponentCount(sessionId: string, player1Id: string, player2Id: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pairing_history (session_id, player1_id, player2_id, times_as_teammates, times_as_opponents)
    VALUES (@session_id, @player1_id, @player2_id, 0, 1)
    ON CONFLICT(session_id, player1_id, player2_id) DO UPDATE SET
      times_as_opponents = times_as_opponents + 1
  `).run({ session_id: sessionId, player1_id: player1Id, player2_id: player2Id });
}

export function getPairingHistory(sessionId: string, player1Id: string, player2Id: string): PairingHistoryRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM pairing_history WHERE session_id = ? AND player1_id = ? AND player2_id = ?'
  ).get(sessionId, player1Id, player2Id) as PairingHistoryRow | undefined;
}

export function getPairingHistoryBySession(sessionId: string): PairingHistoryRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM pairing_history WHERE session_id = ?'
  ).all(sessionId) as PairingHistoryRow[];
}

// ============================================================
// Session Pairing Mode
// ============================================================

export function updateSessionPairingMode(sessionId: string, pairingMode: string, updatedAt: string): void {
  const db = getDb();
  db.prepare(
    'UPDATE sessions SET pairing_mode = ?, updated_at = ? WHERE id = ?'
  ).run(pairingMode, updatedAt, sessionId);
}

// ============================================================
// Session Settings
// ============================================================

export interface SessionSettingsRow {
  name: string;
  court_count: number;
  court_name: string;
  session_type: string;
  game_mode: string;
  matching_mode: string;
  session_duration_hours: number;
  mlp_config: string | null;
  club_raid_config: string | null;
}

export function updateSessionSettings(sessionId: string, settings: SessionSettingsRow & { updated_at: string }): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions
    SET name = @name, court_count = @court_count, court_name = @court_name,
        session_type = @session_type, game_mode = @game_mode, matching_mode = @matching_mode,
        session_duration_hours = @session_duration_hours, mlp_config = @mlp_config,
        club_raid_config = @club_raid_config,
        updated_at = @updated_at
    WHERE id = @id
  `).run({ id: sessionId, ...settings });
}

export function getSessionSettings(sessionId: string): SessionSettingsRow | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT name, court_count, court_name, session_type, game_mode, matching_mode, session_duration_hours, mlp_config, club_raid_config FROM sessions WHERE id = ?'
  ).get(sessionId) as SessionSettingsRow | undefined;
  return row;
}

// ============================================================
// Match History Queries
// ============================================================

/**
 * Get all matches that a specific player participated in for a session.
 * Returns matches ordered by started_at descending (most recent first).
 */
export function getMatchesByPlayerId(sessionId: string, playerId: string): MatchRow[] {
  const db = getDb();
  // player_ids is a JSON array, so we search for the player ID within it
  return db.prepare(`
    SELECT * FROM matches
    WHERE session_id = ? AND player_ids LIKE ?
    ORDER BY started_at DESC
  `).all(sessionId, `%"${playerId}"%`) as MatchRow[];
}

/**
 * Get head-to-head records between a player and all their opponents in a session.
 * Returns pairing history rows where the given player is either player1 or player2
 * and times_as_opponents > 0.
 */
export function getHeadToHeadRecords(sessionId: string, playerId: string): PairingHistoryRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM pairing_history
    WHERE session_id = ? AND (player1_id = ? OR player2_id = ?) AND times_as_opponents > 0
  `).all(sessionId, playerId, playerId) as PairingHistoryRow[];
}

// ============================================================
// Player Achievement Repository
// ============================================================

export interface PlayerAchievementRow {
  id: string;
  player_id: string;
  session_id: string;
  kind: string;
  awarded_at: string;
}

export function createAchievement(achievement: PlayerAchievementRow): PlayerAchievementRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO player_achievements (id, player_id, session_id, kind, awarded_at)
    VALUES (@id, @player_id, @session_id, @kind, @awarded_at)
    ON CONFLICT(player_id, session_id, kind) DO NOTHING
  `).run(achievement);
  return achievement;
}

export function getAchievementsByPlayer(sessionId: string, playerId: string): PlayerAchievementRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM player_achievements WHERE session_id = ? AND player_id = ?'
  ).all(sessionId, playerId) as PlayerAchievementRow[];
}

export function getAchievementsBySession(sessionId: string): PlayerAchievementRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM player_achievements WHERE session_id = ?'
  ).all(sessionId) as PlayerAchievementRow[];
}

export function deleteAchievement(sessionId: string, playerId: string, kind: string): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM player_achievements WHERE session_id = ? AND player_id = ? AND kind = ?'
  ).run(sessionId, playerId, kind);
}

// ============================================================
// Club Raid Repository
// ============================================================

export function createClub(club: ClubRow): ClubRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO clubs (id, session_id, name, color, created_at)
    VALUES (@id, @session_id, @name, @color, @created_at)
  `).run(club);
  return club;
}

export function getClubsBySession(sessionId: string): ClubRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM clubs WHERE session_id = ? ORDER BY name'
  ).all(sessionId) as ClubRow[];
}

export function getClubById(clubId: string): ClubRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId) as ClubRow | undefined;
}

export function deleteClubsBySession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM clubs WHERE session_id = ?').run(sessionId);
}

// Club Members

export function addClubMember(member: ClubMemberRow): ClubMemberRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO club_members (id, club_id, player_id, joined_at)
    VALUES (@id, @club_id, @player_id, @joined_at)
    ON CONFLICT(club_id, player_id) DO NOTHING
  `).run(member);
  return member;
}

export function getClubMembersByClub(clubId: string): ClubMemberRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM club_members WHERE club_id = ? ORDER BY joined_at'
  ).all(clubId) as ClubMemberRow[];
}

export function getClubMembersBySession(sessionId: string): ClubMemberRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT cm.* FROM club_members cm
    JOIN clubs c ON cm.club_id = c.id
    WHERE c.session_id = ?
    ORDER BY c.name, cm.joined_at
  `).all(sessionId) as ClubMemberRow[];
}

export function getClubForMember(sessionId: string, playerId: string): ClubRow | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT c.* FROM clubs c
    JOIN club_members cm ON c.id = cm.club_id
    WHERE c.session_id = ? AND cm.player_id = ?
  `).get(sessionId, playerId) as ClubRow | undefined;
}

export function removeClubMember(clubId: string, playerId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM club_members WHERE club_id = ? AND player_id = ?').run(clubId, playerId);
}

export function deleteClubMembersBySession(sessionId: string): void {
  const db = getDb();
  db.prepare(`
    DELETE FROM club_members WHERE club_id IN (
      SELECT id FROM clubs WHERE session_id = ?
    )
  `).run(sessionId);
}

// Club Raid Matches

export function createClubRaidMatch(match: ClubRaidMatchRow): ClubRaidMatchRow {
  const db = getDb();
  db.prepare(`
    INSERT INTO club_raid_matches (id, session_id, round, club_a_id, club_b_id, club_a_player_1, club_a_player_2, club_b_player_1, club_b_player_2, match_id, status, winner_club_id, created_at)
    VALUES (@id, @session_id, @round, @club_a_id, @club_b_id, @club_a_player_1, @club_a_player_2, @club_b_player_1, @club_b_player_2, @match_id, @status, @winner_club_id, @created_at)
  `).run(match);
  return match;
}

export function getClubRaidMatchesBySession(sessionId: string): ClubRaidMatchRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM club_raid_matches WHERE session_id = ? ORDER BY round, id'
  ).all(sessionId) as ClubRaidMatchRow[];
}

export function getClubRaidMatchesByRound(sessionId: string, round: number): ClubRaidMatchRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM club_raid_matches WHERE session_id = ? AND round = ? ORDER BY id'
  ).all(sessionId, round) as ClubRaidMatchRow[];
}

export function updateClubRaidMatch(matchId: string, updates: Partial<Pick<ClubRaidMatchRow, 'match_id' | 'status' | 'winner_club_id' | 'club_a_player_1' | 'club_a_player_2' | 'club_b_player_1' | 'club_b_player_2'>>): void {
  const db = getDb();
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id: matchId };

  if (updates.match_id !== undefined) {
    setClauses.push('match_id = @match_id');
    params.match_id = updates.match_id;
  }
  if (updates.status !== undefined) {
    setClauses.push('status = @status');
    params.status = updates.status;
  }
  if (updates.winner_club_id !== undefined) {
    setClauses.push('winner_club_id = @winner_club_id');
    params.winner_club_id = updates.winner_club_id;
  }
  if (updates.club_a_player_1 !== undefined) {
    setClauses.push('club_a_player_1 = @club_a_player_1');
    params.club_a_player_1 = updates.club_a_player_1;
  }
  if (updates.club_a_player_2 !== undefined) {
    setClauses.push('club_a_player_2 = @club_a_player_2');
    params.club_a_player_2 = updates.club_a_player_2;
  }
  if (updates.club_b_player_1 !== undefined) {
    setClauses.push('club_b_player_1 = @club_b_player_1');
    params.club_b_player_1 = updates.club_b_player_1;
  }
  if (updates.club_b_player_2 !== undefined) {
    setClauses.push('club_b_player_2 = @club_b_player_2');
    params.club_b_player_2 = updates.club_b_player_2;
  }

  if (setClauses.length === 0) return;

  db.prepare(`UPDATE club_raid_matches SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
}

export function deleteClubRaidMatchesBySession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM club_raid_matches WHERE session_id = ?').run(sessionId);
}

// ============================================================
// Club Raid per-player fairness history
// ============================================================
export interface ClubRaidPlayerHistoryRow {
  session_id: string;
  player_id: string;
  games_played: number;
  extra_appearances: number;
  partner_counts: string;
  opponent_counts: string;
  updated_at: string;
}

export function getClubRaidPlayerHistory(sessionId: string): ClubRaidPlayerHistoryRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM club_raid_player_history WHERE session_id = ?'
  ).all(sessionId) as ClubRaidPlayerHistoryRow[];
}

// Replace the entire session's history (used after a schedule is generated so the
// scheduler can accumulate across "+ Add Round" calls). Clears then inserts.
export function replaceClubRaidPlayerHistory(sessionId: string, rows: ClubRaidPlayerHistoryRow[]): void {
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM club_raid_player_history WHERE session_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO club_raid_player_history
      (session_id, player_id, games_played, extra_appearances, partner_counts, opponent_counts, updated_at)
    VALUES
      (@session_id, @player_id, @games_played, @extra_appearances, @partner_counts, @opponent_counts, @updated_at)
  `);
  const tx = db.transaction(() => {
    deleteStmt.run(sessionId);
    for (const r of rows) insertStmt.run(r);
  });
  tx();
}

export function deleteClubRaidPlayerHistory(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM club_raid_player_history WHERE session_id = ?').run(sessionId);
}

export function getClubStandings(sessionId: string): Array<{ club_id: string; wins: number; losses: number; matches_played: number; points_for: number; points_against: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.id as club_id,
      COALESCE(SUM(CASE WHEN crm.winner_club_id = c.id THEN 1 ELSE 0 END), 0) as wins,
      COALESCE(SUM(CASE WHEN crm.winner_club_id IS NOT NULL AND crm.winner_club_id != c.id THEN 1 ELSE 0 END), 0) as losses,
      COALESCE(SUM(CASE WHEN crm.status = 'completed' THEN 1 ELSE 0 END), 0) as matches_played,
      COALESCE(SUM(CASE WHEN c.id = crm.club_a_id THEN mr.team1_score ELSE mr.team2_score END), 0) as points_for,
      COALESCE(SUM(CASE WHEN c.id = crm.club_a_id THEN mr.team2_score ELSE mr.team1_score END), 0) as points_against
    FROM clubs c
    LEFT JOIN club_raid_matches crm ON (c.id = crm.club_a_id OR c.id = crm.club_b_id) AND crm.session_id = c.session_id
    LEFT JOIN match_results mr ON mr.match_id = crm.match_id
    WHERE c.session_id = ?
    GROUP BY c.id
  `).all(sessionId) as Array<{ club_id: string; wins: number; losses: number; matches_played: number; points_for: number; points_against: number }>;
}

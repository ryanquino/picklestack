/** A single open play session configured by an organizer */
export interface Session {
  id: string;              // UUID
  name: string;            // 1-50 chars after trim
  courtCount: number;      // 1-12 inclusive
  status: 'active' | 'ended';
  liveViewUrl: string;     // Unique shareable URL
  sessionType?: SessionType;    // 'tournament' | 'open_play'
  gameMode?: GameMode;          // 'doubles' | 'singles' | 'mlp'
  matchingMode?: MatchingMode;  // 'queue' | 'smart' | 'tournament' | 'skill_courts'
  courtName?: string;           // 0-50 chars, optional label
  mlpConfig?: MLPTournamentConfig;
  createdAt: Date;
  updatedAt: Date;
}

/** A participant checked into a session */
export interface Player {
  id: string;              // UUID
  sessionId: string;       // FK to Session
  name: string;            // 1-30 chars, at least 1 non-whitespace
  checkedInAt: Date;
}

/** A player's position in the queue */
export interface QueueEntry {
  playerId: string;        // FK to Player
  sessionId: string;       // FK to Session
  position: number;        // 0-based index
}

/** A numbered court available for play during a session */
export interface Court {
  sessionId: string;       // FK to Session
  courtNumber: number;     // 1-based, up to courtCount
  status: 'available' | 'active';
}

/** A single game played on a court by an assigned group of players */
export interface Match {
  id: string;              // UUID
  sessionId: string;       // FK to Session
  courtNumber: number;     // Which court
  playerIds: string[];     // Exactly 4 player IDs, ordered by original queue position
  status: 'active' | 'completed';
  startedAt: Date;
  completedAt?: Date;
}

/** Summary statistics returned when a session ends */
export interface SessionSummary {
  totalPlayersCheckedIn: number;
  totalMatchesCompleted: number;
}

// --- Session Settings Types ---

/** Session type: tournament or open play */
export type SessionType = 'tournament' | 'open_play';

/** Game mode determining players per match */
export type GameMode = 'doubles' | 'singles' | 'mlp';

/** Matching mode for player assignment */
export type MatchingMode = 'casual' | 'balanced' | 'competitive' | 'queue' | 'comeback' | 'club_raid';

/** Extended session settings */
export interface SessionSettings {
  name: string;
  courtCount: number;
  courtName: string;
  sessionType: SessionType;
  gameMode: GameMode;
  matchingMode: MatchingMode;
  sessionDurationHours: number;
  mlpConfig?: MLPTournamentConfig;
  clubRaidConfig?: ClubRaidConfig;
}

/** Match result with optional scores */
export interface MatchResultWithScore extends MatchResult {
  team1Score: number | null;
  team2Score: number | null;
}

// --- Smart Match Scoring Types ---

/** Pairing mode for a session */
export type PairingMode = 'smart' | 'queue';

/** Star rating tier (1-5) representing self-assessed or derived skill level */
export type StarRating = 1 | 2 | 3 | 4 | 5;

/** Star rating labels for display */
export const STAR_RATING_LABELS: Record<StarRating, string> = {
  1: 'Beginner',
  2: 'Novice',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
};

/** Mapping from self-assessed star rating to initial player rating */
export const STAR_TO_RATING: Record<StarRating, number> = {
  1: 400,
  2: 700,
  3: 1000,
  4: 1300,
  5: 1600,
};

/** Derive a star rating from a numeric player rating */
export function ratingToStar(rating: number): StarRating {
  if (rating >= 1400) return 5;
  if (rating >= 1100) return 4;
  if (rating >= 900) return 3;
  if (rating >= 600) return 2;
  return 1;
}

/** Result of a completed match */
export interface MatchResult {
  id: string;
  matchId: string;
  sessionId: string;
  winnerPlayerIds: string[];
  loserPlayerIds: string[];
  team1Score: number | null;
  team2Score: number | null;
  recordedAt: Date;
  updatedAt: Date;
}

/** Player rating within a session */
export interface PlayerRating {
  playerId: string;
  sessionId: string;
  rating: number;        // 100-3000
  matchesPlayed: number;
  wins: number;
  losses: number;
  starRating: StarRating;
}

/** Player statistics for display */
export interface PlayerStats {
  playerId: string;
  playerName: string;
  rating: number;
  starRating: StarRating;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number;       // 0-100 percentage, one decimal place
  streak: number;        // positive = win streak, negative = loss streak, 0 = none
  pointDifferential: number; // total points scored minus total points allowed (only from scored matches)
}

/** Leaderboard entry for session summary */
export interface LeaderboardEntry extends PlayerStats {
  rank: number;
  isMvp: boolean;
  achievements: Achievement[];
}

/** Achievement kinds awarded during a session */
export enum AchievementKind {
  IronPlayer = 'IronPlayer',
  Undefeated = 'Undefeated',
  HotStreak = 'HotStreak',
  ComebackKing = 'ComebackKing',
  SocialButterfly = 'SocialButterfly',
}

/** An achievement earned by a player during a session */
export interface Achievement {
  playerId: string;
  sessionId: string;
  kind: AchievementKind;
  awardedAt: Date;
}

/** A single entry in a player's match history */
export interface MatchHistoryEntry {
  matchId: string;
  matchIndex: number;
  courtNumber: number;
  teammateIds: string[];
  opponentIds: string[];
  result: 'win' | 'loss' | 'skipped';
  timestamp: Date;
  team1Score: number | null;
  team2Score: number | null;
}

/** Head-to-head record between two players */
export interface HeadToHeadRecord {
  opponentId: string;
  opponentName: string;
  wins: number;
  losses: number;
  encounters: number;
}

/** Full player profile combining stats, history, and achievements */
export interface PlayerProfile {
  playerId: string;
  playerName: string;
  starRating: StarRating;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number;
  streak: number;
  matchHistory: MatchHistoryEntry[];
  headToHead: HeadToHeadRecord[];
  achievements: Achievement[];
}

// --- Session Intelligence Types ---

/** Stored match quality rating (database row) */
export interface MatchQualityRow {
  match_id: string;
  session_id: string;
  score_closeness_score: number;
  rating_balance_score: number;
  freshness_score: number;
  match_quality_rating: number;
  has_scores: number;       // 0 or 1 (SQLite boolean)
  computed_at: string;
}

/** Match quality metrics for a single completed match */
export interface MatchQuality {
  matchId: string;
  courtNumber: number;
  scoreClosenessScore: number;
  ratingBalanceScore: number;
  freshnessScore: number;
  matchQualityRating: number;
  hasScores: boolean;
}

/** Aggregate session quality metrics */
export interface SessionQualityMetrics {
  sessionQualityScore: number | null;
  recentMatchRatings: Array<{ courtNumber: number; rating: number }>;
  totalMatchesRated: number;
}

/** Pace metrics for the organizer dashboard */
export interface PaceMetrics {
  averageMatchDurationSeconds: number | null;
  pacingProjection: number | null;
  remainingMinutes: number;
  warningMessage: string | null;
  displayMessage: string;
}

/** Estimated wait time for a queued player */
export interface WaitEstimate {
  playerId: string;
  estimatedMinutes: number | null;
}

/** Session state extensions for session intelligence data */
export interface SessionStateExtensions {
  diversity: Record<string, number>;             // playerId → percentage
  waitEstimates: Record<string, number | null>;  // playerId → minutes or null
  paceMetrics: PaceMetrics;
  qualityMetrics: SessionQualityMetrics;
}

// ============================================================
// MLP Tournament Types
// ============================================================

/** Gender for MLP team composition */
export type PlayerGender = 'male' | 'female';

/** MLP sub-game types within a team match */
export type MLPSubGame = 'womens_doubles' | 'mens_doubles' | 'mixed_doubles_1' | 'mixed_doubles_2' | 'dreambreaker';

/** MLP tournament configuration stored on the session */
export interface MLPTournamentConfig {
  thirdPlacePlayoff: boolean;       // Whether semifinal losers play for 3rd
  gameTo: 11 | 15;                  // Points per game (normal)
  dreamBreakerEnabled: boolean;     // Whether dreambreaker is used at 2-2
  dreamBreakerTo: number;           // Points for dreambreaker (default 21)
  teamCount: number;                // Number of teams in the bracket
}

/** A team in the MLP tournament (4 players: 2M + 2F) */
export interface TournamentTeam {
  id: string;
  sessionId: string;
  name: string;                     // Team display name
  player1Id: string;
  player1Name?: string;
  player2Id: string;
  player2Name?: string;
  player3Id: string;
  player3Name?: string;
  player4Id: string;
  player4Name?: string;
  seed: number;                     // Bracket seeding (1-based)
  createdAt: string;
}

/** A node in the single-elimination bracket */
export interface TournamentBracket {
  id: string;
  sessionId: string;
  round: number;                    // 0 = quarterfinals, 1 = semifinals, 2 = final, etc.
  roundName: string;                // e.g. "Quarterfinals", "Semifinals", "Final"
  matchIndex: number;               // Position within the round (0-based)
  teamAId: string | null;           // null = TBD (bye or waiting for winner)
  teamBId: string | null;
  winnerTeamId: string | null;      // Set after match completes
  matchId: string | null;           // FK to matches table when started
  isBye: boolean;                   // true if this is an auto-bye slot
  createdAt: string;
}

/** Result of a single sub-game within an MLP team match */
export interface MLPSubGameResult {
  subGame: MLPSubGame;
  winningTeamId: string;
  team1Score: number;
  team2Score: number;
}

/** Overall result of an MLP team match */
export interface MLPTeamMatchResult {
  matchId: string;
  bracketId: string;
  teamAId: string;
  teamBId: string;
  teamAWins: number;                // Games won by team A
  teamBWins: number;                // Games won by team B
  subGames: MLPSubGameResult[];
  winnerTeamId: string;
  dreamBreakerPlayed: boolean;
  totalScoreA: number;              // Total points scored by team A
  totalScoreB: number;              // Total points scored by team B
  completedAt: string;
}

// ============================================================
// Club Raid Types
// ============================================================

/** Club Raid tournament configuration stored on the session */
export interface ClubRaidConfig {
  clubCount: number;                // Number of clubs (3-6)
  clubSize: number;                 // Players per club (2-6)
}

/** A club in the Club Raid tournament */
export interface Club {
  id: string;
  sessionId: string;
  name: string;                     // Club display name
  color: string;                    // Hex color for UI
  createdAt: string;
}

/** A member assigned to a club */
export interface ClubMember {
  id: string;
  clubId: string;
  playerId: string;
  playerName?: string;
  joinedAt: string;
}

/** Club standings for the leaderboard */
export interface ClubStandings {
  clubId: string;
  clubName: string;
  clubColor: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number;
  pointDifferential: number;
  members: ClubMember[];
}

/** A scheduled cross-club match in the round-robin */
export interface ClubRaidMatch {
  id: string;
  sessionId: string;
  round: number;                    // Round number (1-based)
  clubAId: string;                  // First club
  clubBId: string;                  // Second club
  clubAPlayer1: string | null;      // Pre-assigned player 1 from club A
  clubAPlayer2: string | null;      // Pre-assigned player 2 from club A
  clubBPlayer1: string | null;      // Pre-assigned player 1 from club B
  clubBPlayer2: string | null;      // Pre-assigned player 2 from club B
  matchId: string | null;           // FK to matches table when started
  status: 'scheduled' | 'active' | 'completed';
  winnerClubId: string | null;      // Set after match completes
  createdAt: string;
}

/** Round-robin schedule for Club Raid */
export interface ClubRaidSchedule {
  rounds: ClubRaidMatchRound[];
  totalRounds: number;
}

/** A single round in the round-robin */
export interface ClubRaidMatchRound {
  round: number;
  matches: ClubRaidMatch[];
}

/**
 * Fair play-order for Club Raid. Matches are grouped by round, then by the
 * club-pairing block (e.g. A vs B, C vs D), then packed into waves across the
 * courts allocated to that block. The ordering maximizes equal rest: each
 * player appears in as few consecutive waves as possible, and the unavoidable
 * "double" player (who plays twice in one round) is pushed to the first and
 * last waves so their idle gap is maximized.
 */
export interface ClubRaidPlayMatch {
  matchId: string;                 // ClubRaidMatch id
  clubAId: string;
  clubBId: string;
  players: [string, string, string, string]; // A1, A2, B1, B2
  isDouble: boolean;               // true if one of these players plays twice this round
  wave: number;                    // 0-based wave index within the block
  courtSlot: number;               // 0-based relative court slot within the block
}

export interface ClubRaidPlayBlock {
  clubAId: string;
  clubBId: string;
  numWaves: number;
  courtsPerBlock: number;
  doublePlayerId: string | null;
  matches: ClubRaidPlayMatch[];
}

export interface ClubRaidPlayRound {
  round: number;
  numWaves: number;
  blocks: ClubRaidPlayBlock[];
}

export interface ClubRaidPlayOrder {
  courtCount: number;
  rounds: ClubRaidPlayRound[];
  /** Per-player average rest (waves between appearances) across the event. */
  restByPlayer: Record<string, number>;
}

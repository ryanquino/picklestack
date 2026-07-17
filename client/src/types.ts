/** A single open play session configured by an organizer */
export interface Session {
  id: string;
  name: string;
  courtCount: number;
  status: 'active' | 'ended';
  liveViewUrl: string;
  createdAt: string;       // ISO date string from API
  updatedAt: string;       // ISO date string from API
  sessionType?: SessionType;
  gameMode?: GameMode;
  matchingMode?: MatchingMode;
  courtName?: string;
  mlpConfig?: MLPTournamentConfig;
}

/** A participant checked into a session */
export interface Player {
  id: string;
  sessionId: string;
  name: string;
  checkedInAt: string;     // ISO date string from API
}

/** A player's position in the queue */
export interface QueueEntry {
  playerId: string;
  sessionId: string;
  position: number;
  isPairSlot: boolean;
  pairId: string | null;
  partnerPlayerId: string | null;
  partnerPlayerName: string | null;
}

/** Two players locked together as permanent teammates for a session */
export interface FixedPair {
  id: string;
  sessionId: string;
  player1Id: string;
  player1Name?: string;
  player2Id: string;
  player2Name?: string;
  createdAt: string;       // ISO date string from API
}

/** A numbered court available for play during a session */
export interface Court {
  sessionId: string;
  courtNumber: number;
  status: 'available' | 'active';
}

/** A single game played on a court by an assigned group of players */
export interface Match {
  id: string;
  sessionId: string;
  courtNumber: number;
  playerIds: string[];
  status: 'active' | 'completed';
  startedAt: string;       // ISO date string from API
  completedAt?: string;    // ISO date string from API
}

/** Summary statistics returned when a session ends */
export interface SessionSummary {
  totalPlayersCheckedIn: number;
  totalMatchesCompleted: number;
  leaderboard: LeaderboardEntry[];
  achievements: Achievement[];
}

// --- Session Settings Types ---

/** Session type: tournament or open play */
export type SessionType = 'tournament' | 'open_play';

/** Game mode determining players per match */
export type GameMode = 'doubles' | 'singles' | 'mlp';

/** Matching mode for player assignment */
export type MatchingMode = 'casual' | 'balanced' | 'competitive' | 'queue' | 'comeback';

/** Session settings for configuration */
export interface SessionSettings {
  name: string;
  courtCount: number;
  courtName: string;
  sessionType: SessionType;
  gameMode: GameMode;
  matchingMode: MatchingMode;
  sessionDurationHours: number;
  mlpConfig?: MLPTournamentConfig;
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

/** Result of a completed match */
export interface MatchResult {
  id: string;
  matchId: string;
  sessionId: string;
  winnerPlayerIds: [string, string];
  loserPlayerIds: [string, string];
  recordedAt: string;      // ISO date string from API
  updatedAt: string;       // ISO date string from API
}

/** A completed casual match result with match + player details, for the Results panel */
export interface CasualMatchResult {
  matchId: string;
  matchIndex: number;
  courtNumber: number;
  status: string;
  playerIds: string[];
  playerNames: string[];
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  team1Score: number | null;
  team2Score: number | null;
  winningTeam: 'team1' | 'team2';
  recordedAt: string;
  updatedAt: string;
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
  winRate: number;         // 0-100 percentage, one decimal place
  streak: number;          // positive = win streak, negative = loss streak, 0 = none
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
  awardedAt: string;       // ISO date string from API
}

/** A single entry in a player's match history */
export interface MatchHistoryEntry {
  matchId: string;
  matchIndex: number;
  courtNumber: number;
  teammateIds: string[];
  opponentIds: string[];
  result: 'win' | 'loss' | 'skipped';
  timestamp: string;       // ISO date string from API
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

/** A player added to the creation form but not yet checked in on the server */
export interface PendingPlayer {
  localId: string;       // Client-generated UUID for React key and removal
  name: string;          // 1-30 characters
  starRating: StarRating; // 1-5
  checkedIn: boolean;    // Must be checked in before entering the dashboard
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

// ============================================================
// MLP Tournament Types
// ============================================================

/** Gender for MLP team composition */
export type PlayerGender = 'male' | 'female';

/** MLP sub-game types within a team match */
export type MLPSubGame = 'womens_doubles' | 'mens_doubles' | 'mixed_doubles_1' | 'mixed_doubles_2' | 'dreambreaker';

/** MLP tournament configuration */
export interface MLPTournamentConfig {
  thirdPlacePlayoff: boolean;
  gameTo: 11 | 15;
  dreamBreakerEnabled: boolean;
  dreamBreakerTo: number;
  teamCount: number;
}

/** A team in the MLP tournament */
export interface TournamentTeam {
  id: string;
  sessionId: string;
  name: string;
  player1Id: string;
  player1Name?: string;
  player2Id: string;
  player2Name?: string;
  player3Id: string;
  player3Name?: string;
  player4Id: string;
  player4Name?: string;
  seed: number;
  createdAt: string;
}

/** A node in the single-elimination bracket */
export interface TournamentBracket {
  id: string;
  sessionId: string;
  round: number;
  roundName: string;
  matchIndex: number;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  matchId: string | null;
  isBye: boolean;
  createdAt: string;
}

/** Result of a single sub-game */
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
  teamAWins: number;
  teamBWins: number;
  subGames: MLPSubGameResult[];
  winnerTeamId: string;
  dreamBreakerPlayed: boolean;
  completedAt: string;
}

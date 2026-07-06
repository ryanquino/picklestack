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
  player2Id: string;
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
export type GameMode = 'doubles' | 'singles';

/** Matching mode for player assignment */
export type MatchingMode = 'queue' | 'smart' | 'tournament' | 'skill_courts';

/** Session settings for configuration */
export interface SessionSettings {
  name: string;
  courtCount: number;
  courtName: string;
  sessionType: SessionType;
  gameMode: GameMode;
  matchingMode: MatchingMode;
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

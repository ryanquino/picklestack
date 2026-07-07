import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ValidationError, NotFoundError } from './errors';
import * as sessionService from './services/sessionService';
import * as queueService from './services/queueService';
import * as courtService from './services/courtService';
import * as matchResultService from './services/matchResultService';
import * as achievementsService from './services/achievementsService';
import * as ratingService from './services/ratingService';
import * as fixedPairService from './services/fixedPairService';
import { computeSessionDiversity } from './services/diversityService';
import { computeWaitEstimates } from './services/queueEstimatorService';
import { computePaceMetrics } from './services/paceService';
import { computeMatchQuality, getSessionQualityMetrics } from './services/qualityScorerService';
import {
  getActiveMatchByCourt,
  getActiveMatchesBySession,
  getPlayerById,
  getPlayersBySession,
  getCompletedMatchCountBySession,
  getSessionById,
  getMatchesByPlayerId,
  getMatchesBySession,
  getHeadToHeadRecords,
  getPlayerRatingsBySession,
  getMatchResultsBySession,
  updateSessionPairingMode,
  MatchRow,
} from './repository';
import { getDb } from './db';
import {
  PlayerStats,
  LeaderboardEntry,
  MatchHistoryEntry,
  HeadToHeadRecord,
  PlayerProfile,
  Achievement,
  StarRating,
  ratingToStar,
  AchievementKind,
} from './types';
import { getOnDeckPlayerIds } from './onDeck';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  try {
    getDb(); // Ensure DB is initialized
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Health check failed:', message);
    res.status(500).json({ status: 'error', error: message });
  }
});

// ============================================================
// Session Routes
// ============================================================

/**
 * POST /api/sessions — Create a new session
 */
app.post('/api/sessions', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, courtCount } = req.body;
    const session = sessionService.createSession(name, courtCount);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sessions/:sessionId/settings — Update session settings
 */
app.put('/api/sessions/:sessionId/settings', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { name, courtCount, courtName, sessionType, gameMode, matchingMode, sessionDurationHours } = req.body;
    sessionService.updateSessionSettings(sessionId, {
      name,
      courtCount,
      courtName: courtName ?? '',
      sessionType,
      gameMode,
      matchingMode,
      sessionDurationHours: sessionDurationHours ?? 4,
    });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/settings — Get session settings
 */
app.get('/api/sessions/:sessionId/settings', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const settings = sessionService.getSessionSettings(sessionId);
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sessions/:sessionId/courts/:courtNumber/name — Rename a court
 */
app.put('/api/sessions/:sessionId/courts/:courtNumber/name', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const courtNumber = parseInt(req.params.courtNumber as string, 10);
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      throw new ValidationError('Court name is required', ['name']);
    }

    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Parse existing court names or start fresh
    let courtNames: Record<string, string> = {};
    try {
      courtNames = JSON.parse(session.court_names || '{}');
    } catch {
      courtNames = {};
    }

    courtNames[String(courtNumber)] = name.trim();

    // Update the session row
    getDb().prepare('UPDATE sessions SET court_names = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(courtNames), new Date().toISOString(), sessionId);

    res.json({ success: true, courtNames });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId — Get full session state for organizer
 */
app.get('/api/sessions/:sessionId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = sessionService.getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Check if session is expired (more than 24 hours since last state change)
    const lastUpdate = new Date(session.updatedAt).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (now - lastUpdate > twentyFourHours) {
      res.status(410).json({ error: 'Session has expired. State cannot be restored after 24 hours of inactivity.' });
      return;
    }

    const queue = queueService.getQueue(sessionId);
    const courts = courtService.getCourts(sessionId);
    const activeMatches = getActiveMatchesBySession(sessionId);

    // Get pairing mode from the raw session row
    const sessionRow = getSessionById(sessionId)!;
    const pairingMode = sessionRow.pairing_mode;

    // Get player stats and achievements
    const playerStats = matchResultService.getPlayerStats(sessionId);
    const achievements = achievementsService.getSessionAchievementsAll(sessionId);

    const matches = activeMatches.map((match: MatchRow) => ({
      id: match.id,
      sessionId: match.session_id,
      courtNumber: match.court_number,
      playerIds: JSON.parse(match.player_ids) as string[],
      players: (JSON.parse(match.player_ids) as string[]).map((playerId) => {
        const player = getPlayerById(playerId);
        return player ? { id: player.id, name: player.name } : { id: playerId, name: '(removed)' };
      }),
      status: match.status,
      startedAt: match.started_at,
      completedAt: match.completed_at,
    }));

    // Compute session intelligence data
    const diversityMap = computeSessionDiversity(sessionId);
    const diversity: Record<string, number> = Object.fromEntries(diversityMap);

    const waitEstimatesList = computeWaitEstimates(sessionId);
    const waitEstimates: Record<string, number | null> = {};
    for (const entry of waitEstimatesList) {
      waitEstimates[entry.playerId] = entry.estimatedMinutes;
    }

    const paceMetrics = computePaceMetrics(sessionId);
    const qualityMetrics = getSessionQualityMetrics(sessionId);

    res.json({
      session: {
        ...session,
        pairingMode,
        sessionType: session.sessionType,
        gameMode: session.gameMode,
        matchingMode: session.matchingMode,
        courtName: session.courtName,
        courtNames: JSON.parse(sessionRow.court_names || '{}'),
      },
      queue,
      courts,
      activeMatches: matches,
      playerStats,
      achievements,
      totalCompletedMatches: getCompletedMatchCountBySession(sessionId),
      diversity,
      waitEstimates,
      paceMetrics,
      qualityMetrics,
      ...(session.status === 'ended' ? {
        summary: {
          totalPlayersCheckedIn: getPlayersBySession(sessionId).length,
          totalMatchesCompleted: getCompletedMatchCountBySession(sessionId),
        },
        completedMatches: (() => {
          const allMatches = getMatchesBySession(sessionId);
          const resultRows = getMatchResultsBySession(sessionId);
          const resultByMatchId = new Map(resultRows.map(r => [r.match_id, r]));
          return allMatches
            .filter(m => m.status === 'completed')
            .map(m => {
              const result = resultByMatchId.get(m.id);
              const playerIds: string[] = JSON.parse(m.player_ids);
              const playerNames = playerIds.map(pid => {
                const p = getPlayerById(pid);
                return p ? p.name : '(removed)';
              });
              let winningTeam: number | null = null;
              if (result) {
                const winnerIds: string[] = JSON.parse(result.winner_player_ids);
                const midpoint = Math.ceil(playerIds.length / 2);
                const team1Ids = playerIds.slice(0, midpoint);
                if (winnerIds.some(wid => team1Ids.includes(wid))) {
                  winningTeam = 1;
                } else {
                  winningTeam = 2;
                }
              }
              return {
                id: m.id,
                courtNumber: m.court_number,
                players: playerNames,
                winningTeam,
                team1Score: result?.team1_score ?? null,
                team2Score: result?.team2_score ?? null,
                startedAt: m.started_at,
                completedAt: m.completed_at,
              };
            });
        })(),
      } : {}),
    });
  } catch (err) {
    next(err);
  }
});


/**
 * GET /api/sessions/:sessionId/live — Get session state for live view
 */
app.get('/api/sessions/:sessionId/live', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = sessionService.getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const queue = queueService.getQueue(sessionId);
    const courts = courtService.getCourts(sessionId);
    const activeMatches = getActiveMatchesBySession(sessionId);

    // Get player stats and achievements for enrichment
    const playerStats = matchResultService.getPlayerStats(sessionId);
    const achievements = achievementsService.getSessionAchievementsAll(sessionId);
    const statsMap = new Map(playerStats.map((s) => [s.playerId, s]));
    const achievementsByPlayer = new Map<string, Achievement[]>();
    for (const a of achievements) {
      const list = achievementsByPlayer.get(a.playerId) || [];
      list.push(a);
      achievementsByPlayer.set(a.playerId, list);
    }

    // Determine MVP: highest win rate among players with 3+ matches
    let mvpPlayerId: string | null = null;
    let mvpWinRate = -1;
    for (const stat of playerStats) {
      if (stat.matchesPlayed >= 3 && stat.winRate > mvpWinRate) {
        mvpWinRate = stat.winRate;
        mvpPlayerId = stat.playerId;
      }
    }

    // Format queue with "up next" marking for first 4, plus player stats
    const formattedQueue = queue.map((entry, index) => {
      const stats = statsMap.get(entry.playerId);
      return {
        playerId: entry.playerId,
        playerName: entry.playerName,
        position: entry.position,
        isUpNext: index < 4,
        rating: stats?.rating ?? 1000,
        starRating: stats?.starRating ?? 3,
        wins: stats?.wins ?? 0,
        losses: stats?.losses ?? 0,
        winRate: stats?.winRate ?? 0,
        streak: stats?.streak ?? 0,
        isMvp: entry.playerId === mvpPlayerId,
        achievements: achievementsByPlayer.get(entry.playerId) || [],
      };
    });

    const matches = activeMatches.map((match: MatchRow) => ({
      id: match.id,
      courtNumber: match.court_number,
      players: (JSON.parse(match.player_ids) as string[]).map((playerId) => {
        const player = getPlayerById(playerId);
        const stats = statsMap.get(playerId);
        return {
          id: playerId,
          name: player ? player.name : '(removed)',
          rating: stats?.rating ?? 1000,
          starRating: stats?.starRating ?? 3,
          wins: stats?.wins ?? 0,
          losses: stats?.losses ?? 0,
          winRate: stats?.winRate ?? 0,
          streak: stats?.streak ?? 0,
          isMvp: playerId === mvpPlayerId,
          achievements: achievementsByPlayer.get(playerId) || [],
        };
      }),
      status: match.status,
      startedAt: match.started_at,
    }));

    // Include completed match log for ended sessions
    let completedMatches: Array<{
      id: string;
      courtNumber: number;
      players: string[];
      winningTeam: number | null;
      team1Score: number | null;
      team2Score: number | null;
      startedAt: string;
      completedAt: string | null;
    }> = [];

    if (session.status === 'ended') {
      const allMatches = getMatchesBySession(sessionId);
      const resultRows = getMatchResultsBySession(sessionId);
      const resultByMatchId = new Map(resultRows.map(r => [r.match_id, r]));

      completedMatches = allMatches
        .filter(m => m.status === 'completed')
        .map(m => {
          const result = resultByMatchId.get(m.id);
          const playerIds: string[] = JSON.parse(m.player_ids);
          const playerNames = playerIds.map(pid => {
            const p = getPlayerById(pid);
            return p ? p.name : '(removed)';
          });
          // Determine winning team: team 1 = first half, team 2 = second half
          let winningTeam: number | null = null;
          if (result) {
            const winnerIds: string[] = JSON.parse(result.winner_player_ids);
            const midpoint = Math.ceil(playerIds.length / 2);
            const team1Ids = playerIds.slice(0, midpoint);
            if (winnerIds.some(wid => team1Ids.includes(wid))) {
              winningTeam = 1;
            } else {
              winningTeam = 2;
            }
          }
          return {
            id: m.id,
            courtNumber: m.court_number,
            players: playerNames,
            winningTeam,
            team1Score: result?.team1_score ?? null,
            team2Score: result?.team2_score ?? null,
            startedAt: m.started_at,
            completedAt: m.completed_at,
          };
        });
    }

    // Compute wait estimates for queued players
    const waitEstimatesList = computeWaitEstimates(sessionId);
    const waitEstimates: Record<string, number | null> = {};
    for (const entry of waitEstimatesList) {
      waitEstimates[entry.playerId] = entry.estimatedMinutes;
    }

    res.json({
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        courtCount: session.courtCount,
        sessionType: session.sessionType,
        gameMode: session.gameMode,
        matchingMode: session.matchingMode,
        courtName: session.courtName,
        courtNames: JSON.parse(getSessionById(sessionId)?.court_names || '{}'),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      queue: formattedQueue,
      courts,
      activeMatches: matches,
      playerStats,
      achievements,
      completedMatches,
      totalCompletedMatches: getCompletedMatchCountBySession(sessionId),
      waitEstimates,
      onDeckPlayerIds: getOnDeckPlayerIds(
        queue.map(e => ({ playerId: e.playerId, position: e.position })),
        (session.gameMode || 'doubles') as 'doubles' | 'singles',
        (session.matchingMode || 'balanced') as 'casual' | 'balanced' | 'competitive' | 'queue'
      ),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/courts/:courtNumber/replace
 * Body: { oldPlayerId: string, newPlayerId: string }
 */
app.post('/api/sessions/:sessionId/courts/:courtNumber/replace', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const courtNumber = parseInt(req.params.courtNumber as string, 10);
    const { oldPlayerId, newPlayerId } = req.body;

    if (!oldPlayerId || !newPlayerId) {
      throw new ValidationError('Both oldPlayerId and newPlayerId are required', ['oldPlayerId', 'newPlayerId']);
    }

    const updatedMatch = courtService.replacePlayerInMatch(sessionId, courtNumber, oldPlayerId, newPlayerId);
    res.json({ success: true, match: updatedMatch });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Player Routes
// ============================================================

/**
 * POST /api/sessions/:sessionId/players — Check in a player
 */
app.post('/api/sessions/:sessionId/players', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { name, starRating } = req.body;

    // Validate starRating if provided
    if (starRating !== undefined && (![1, 2, 3, 4, 5].includes(starRating))) {
      throw new ValidationError('Star rating must be between 1 and 5', ['starRating']);
    }

    const player = queueService.addPlayer(sessionId, name);

    // Initialize player rating based on star rating
    ratingService.initializePlayerRating(sessionId, player.id, starRating as StarRating | undefined);

    res.status(201).json(player);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/sessions/:sessionId/players/:playerId — Remove a player
 */
app.delete('/api/sessions/:sessionId/players/:playerId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const playerId = req.params.playerId as string;
    queueService.removePlayer(sessionId, playerId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Queue Routes
// ============================================================

/**
 * PUT /api/sessions/:sessionId/queue/move — Move a player in the queue
 */
app.put('/api/sessions/:sessionId/queue/move', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { playerId, direction } = req.body;
    const updatedQueue = queueService.movePlayer(sessionId, playerId, direction);
    res.json(updatedQueue);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Fixed Pair Routes
// ============================================================

/**
 * POST /api/sessions/:sessionId/pairs — Create a fixed pair
 */
app.post('/api/sessions/:sessionId/pairs', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { player1Id, player2Id } = req.body;
    const pair = fixedPairService.createFixedPair(sessionId, player1Id, player2Id);
    res.status(201).json(pair);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/sessions/:sessionId/pairs/:pairId — Dissolve a fixed pair
 */
app.delete('/api/sessions/:sessionId/pairs/:pairId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const pairId = req.params.pairId as string;
    fixedPairService.dissolveFixedPair(sessionId, pairId);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/pairs — List all fixed pairs in session
 */
app.get('/api/sessions/:sessionId/pairs', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const pairs = fixedPairService.getFixedPairsBySession(sessionId);
    res.status(200).json(pairs);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Court Routes
// ============================================================

/**
 * POST /api/sessions/:sessionId/courts/:courtNumber/start — Start a match on a court
 */
app.post('/api/sessions/:sessionId/courts/:courtNumber/start', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const courtNumber = parseInt(req.params.courtNumber as string, 10);
    const match = courtService.startMatch(sessionId, courtNumber);
    res.status(201).json(match);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/courts/:courtNumber/complete — Complete a match on a court
 */
app.post('/api/sessions/:sessionId/courts/:courtNumber/complete', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const courtNumber = parseInt(req.params.courtNumber as string, 10);
    const { winningTeam, skip, team1Score, team2Score } = req.body || {};

    // Capture match ID before completing (match is still 'active')
    const activeMatch = getActiveMatchByCourt(sessionId, courtNumber);

    courtService.completeMatch(sessionId, courtNumber, { winningTeam, skip, team1Score, team2Score });

    // Compute match quality score (non-blocking — errors are logged but don't prevent response)
    if (activeMatch) {
      try {
        computeMatchQuality(activeMatch.id, sessionId);
      } catch (qualityErr) {
        console.error('Failed to compute match quality score:', qualityErr);
      }
    }



    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Session End Route
// ============================================================

/**
 * POST /api/sessions/:sessionId/end — End a session
 */
app.post('/api/sessions/:sessionId/end', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const summary = sessionService.endSession(sessionId);

    // Generate leaderboard with achievements
    const playerStats = matchResultService.getPlayerStats(sessionId);
    const achievements = achievementsService.getSessionAchievementsAll(sessionId);
    const achievementsByPlayer = new Map<string, Achievement[]>();
    for (const a of achievements) {
      const list = achievementsByPlayer.get(a.playerId) || [];
      list.push(a);
      achievementsByPlayer.set(a.playerId, list);
    }

    // Determine MVP: highest win rate among players with 3+ matches
    let mvpPlayerId: string | null = null;
    let mvpWinRate = -1;
    for (const stat of playerStats) {
      if (stat.matchesPlayed >= 3 && stat.winRate > mvpWinRate) {
        mvpWinRate = stat.winRate;
        mvpPlayerId = stat.playerId;
      }
    }

    // Sort leaderboard: win rate desc → matches played desc → point differential desc
    const sorted = [...playerStats].sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
      return b.pointDifferential - a.pointDifferential;
    });

    // Dense ranking: tied players share the same rank
    let currentRank = 1;
    const leaderboard: LeaderboardEntry[] = sorted.map((stat, index) => {
      if (index > 0) {
        const prev = sorted[index - 1];
        const isTied =
          stat.winRate === prev.winRate &&
          stat.matchesPlayed === prev.matchesPlayed &&
          stat.pointDifferential === prev.pointDifferential;
        if (!isTied) {
          currentRank = currentRank + 1;
        }
      }

      return {
        ...stat,
        rank: currentRank,
        isMvp: stat.playerId === mvpPlayerId,
        achievements: achievementsByPlayer.get(stat.playerId) || [],
      };
    });

    res.json({
      ...summary,
      leaderboard,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Match Result Routes
// ============================================================

/**
 * PUT /api/sessions/:sessionId/matches/:matchId/result — Update a match result
 */
app.put('/api/sessions/:sessionId/matches/:matchId/result', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const matchId = req.params.matchId as string;
    const { winningTeam } = req.body;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Validate session not ended
    if (session.status === 'ended') {
      throw new ValidationError('Cannot update results after session has ended', ['sessionId']);
    }

    // Validate winningTeam
    if (winningTeam !== 'team1' && winningTeam !== 'team2') {
      throw new ValidationError("winningTeam must be 'team1' or 'team2'", ['winningTeam']);
    }

    const result = matchResultService.updateMatchResult(matchId, winningTeam);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Stats Routes
// ============================================================

/**
 * GET /api/sessions/:sessionId/stats — Get player statistics for the session
 */
app.get('/api/sessions/:sessionId/stats', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const stats = matchResultService.getPlayerStats(sessionId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Pairing Mode Routes
// ============================================================

/**
 * PUT /api/sessions/:sessionId/pairing-mode — Toggle pairing mode
 */
app.put('/api/sessions/:sessionId/pairing-mode', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { mode } = req.body;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Validate session is active
    if (session.status === 'ended') {
      throw new ValidationError('Cannot change pairing mode after session has ended', ['sessionId']);
    }

    // Validate mode value
    const validModes = ['casual', 'balanced', 'competitive', 'queue'];
    if (!validModes.includes(mode)) {
      throw new ValidationError("Pairing mode must be 'casual', 'balanced', 'competitive', or 'queue'", ['mode']);
    }

    updateSessionPairingMode(sessionId, mode, new Date().toISOString());
    res.json({ mode });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Leaderboard Routes
// ============================================================

/**
 * GET /api/sessions/:sessionId/leaderboard — Get session leaderboard
 */
app.get('/api/sessions/:sessionId/leaderboard', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const stats = matchResultService.getPlayerStats(sessionId);
    const achievements = achievementsService.getSessionAchievementsAll(sessionId);

    // Sort by win rate desc, then matches played desc, then name asc
    const sorted = [...stats].sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
      return a.playerName.localeCompare(b.playerName);
    });

    // Determine MVP: highest win rate among players with 3+ matches
    let mvpPlayerId: string | null = null;
    const qualifiedPlayers = sorted.filter(s => s.matchesPlayed >= 3);
    if (qualifiedPlayers.length > 0) {
      mvpPlayerId = qualifiedPlayers[0].playerId;
    }

    // Build leaderboard entries
    const leaderboard: LeaderboardEntry[] = sorted.map((stat, index) => {
      const playerAchievements = achievements.filter(a => a.playerId === stat.playerId);
      return {
        ...stat,
        rank: index + 1,
        isMvp: stat.playerId === mvpPlayerId,
        achievements: playerAchievements,
      };
    });

    res.json(leaderboard);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Player History Routes
// ============================================================

/**
 * GET /api/sessions/:sessionId/players/:playerId/history — Get match history for a player
 */
app.get('/api/sessions/:sessionId/players/:playerId/history', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const playerId = req.params.playerId as string;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Validate player exists
    const player = getPlayerById(playerId);
    if (!player) {
      throw new NotFoundError('Player not found');
    }

    const matches = getMatchesByPlayerId(sessionId, playerId);
    const resultRows = getMatchResultsBySession(sessionId);
    const resultByMatchId = new Map(resultRows.map(r => [r.match_id, r]));

    const history: MatchHistoryEntry[] = matches.map(match => {
      const playerIds: string[] = JSON.parse(match.player_ids);
      const playerIndex = playerIds.indexOf(playerId);
      const teammateIds = playerIndex < 2
        ? [playerIds[playerIndex === 0 ? 1 : 0]]
        : [playerIds[playerIndex === 2 ? 3 : 2]];
      const opponentIds = playerIndex < 2
        ? [playerIds[2], playerIds[3]]
        : [playerIds[0], playerIds[1]];

      const matchResult = resultByMatchId.get(match.id);
      let result: 'win' | 'loss' | 'skipped' = 'skipped';
      if (matchResult) {
        const winnerIds: string[] = JSON.parse(matchResult.winner_player_ids);
        result = winnerIds.includes(playerId) ? 'win' : 'loss';
      }

      return {
        matchId: match.id,
        courtNumber: match.court_number,
        teammateIds,
        opponentIds,
        result,
        timestamp: new Date(match.started_at),
        team1Score: matchResult?.team1_score ?? null,
        team2Score: matchResult?.team2_score ?? null,
      };
    });

    res.json(history);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/players/:playerId/head-to-head — Get head-to-head records
 */
app.get('/api/sessions/:sessionId/players/:playerId/head-to-head', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const playerId = req.params.playerId as string;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Validate player exists
    const player = getPlayerById(playerId);
    if (!player) {
      throw new NotFoundError('Player not found');
    }

    const pairingRows = getHeadToHeadRecords(sessionId, playerId);
    const resultRows = getMatchResultsBySession(sessionId);

    // Build head-to-head records by counting wins/losses against each opponent
    const opponentMap = new Map<string, { wins: number; losses: number; encounters: number }>();

    for (const row of pairingRows) {
      const opponentId = row.player1_id === playerId ? row.player2_id : row.player1_id;
      opponentMap.set(opponentId, { wins: 0, losses: 0, encounters: 0 });
    }

    // Count wins and losses from match results
    for (const result of resultRows) {
      const winnerIds: string[] = JSON.parse(result.winner_player_ids);
      const loserIds: string[] = JSON.parse(result.loser_player_ids);
      const allIds = [...winnerIds, ...loserIds];

      if (!allIds.includes(playerId)) continue;

      const isWinner = winnerIds.includes(playerId);
      const opponents = isWinner ? loserIds : winnerIds;

      for (const opponentId of opponents) {
        if (!opponentMap.has(opponentId)) {
          opponentMap.set(opponentId, { wins: 0, losses: 0, encounters: 0 });
        }
        const record = opponentMap.get(opponentId)!;
        record.encounters++;
        if (isWinner) {
          record.wins++;
        } else {
          record.losses++;
        }
      }
    }

    const records: HeadToHeadRecord[] = [];
    for (const [opponentId, record] of opponentMap) {
      if (record.encounters === 0) continue;
      const opponentPlayer = getPlayerById(opponentId);
      records.push({
        opponentId,
        opponentName: opponentPlayer?.name ?? '(removed)',
        wins: record.wins,
        losses: record.losses,
        encounters: record.encounters,
      });
    }

    // Sort by encounters descending
    records.sort((a, b) => b.encounters - a.encounters);

    res.json(records);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/players/:playerId/profile — Get full player profile
 */
app.get('/api/sessions/:sessionId/players/:playerId/profile', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const playerId = req.params.playerId as string;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Validate player exists
    const player = getPlayerById(playerId);
    if (!player) {
      throw new NotFoundError('Player not found');
    }

    // Get player stats
    const allStats = matchResultService.getPlayerStats(sessionId);
    const playerStat = allStats.find(s => s.playerId === playerId);

    // Get match history
    const matches = getMatchesByPlayerId(sessionId, playerId);
    const resultRows = getMatchResultsBySession(sessionId);
    const resultByMatchId = new Map(resultRows.map(r => [r.match_id, r]));

    const matchHistory: MatchHistoryEntry[] = matches.map(match => {
      const playerIds: string[] = JSON.parse(match.player_ids);
      const playerIndex = playerIds.indexOf(playerId);
      const teammateIds = playerIndex < 2
        ? [playerIds[playerIndex === 0 ? 1 : 0]]
        : [playerIds[playerIndex === 2 ? 3 : 2]];
      const opponentIds = playerIndex < 2
        ? [playerIds[2], playerIds[3]]
        : [playerIds[0], playerIds[1]];

      const matchResult = resultByMatchId.get(match.id);
      let result: 'win' | 'loss' | 'skipped' = 'skipped';
      if (matchResult) {
        const winnerIds: string[] = JSON.parse(matchResult.winner_player_ids);
        result = winnerIds.includes(playerId) ? 'win' : 'loss';
      }

      return {
        matchId: match.id,
        courtNumber: match.court_number,
        teammateIds,
        opponentIds,
        result,
        timestamp: new Date(match.started_at),
        team1Score: matchResult?.team1_score ?? null,
        team2Score: matchResult?.team2_score ?? null,
      };
    });

    // Get head-to-head records
    const pairingRows = getHeadToHeadRecords(sessionId, playerId);
    const opponentMap = new Map<string, { wins: number; losses: number; encounters: number }>();

    for (const row of pairingRows) {
      const opponentId = row.player1_id === playerId ? row.player2_id : row.player1_id;
      opponentMap.set(opponentId, { wins: 0, losses: 0, encounters: 0 });
    }

    for (const result of resultRows) {
      const winnerIds: string[] = JSON.parse(result.winner_player_ids);
      const loserIds: string[] = JSON.parse(result.loser_player_ids);
      const allIds = [...winnerIds, ...loserIds];

      if (!allIds.includes(playerId)) continue;

      const isWinner = winnerIds.includes(playerId);
      const opponents = isWinner ? loserIds : winnerIds;

      for (const opponentId of opponents) {
        if (!opponentMap.has(opponentId)) {
          opponentMap.set(opponentId, { wins: 0, losses: 0, encounters: 0 });
        }
        const record = opponentMap.get(opponentId)!;
        record.encounters++;
        if (isWinner) {
          record.wins++;
        } else {
          record.losses++;
        }
      }
    }

    const headToHead: HeadToHeadRecord[] = [];
    for (const [opponentId, record] of opponentMap) {
      if (record.encounters === 0) continue;
      const opponentPlayer = getPlayerById(opponentId);
      headToHead.push({
        opponentId,
        opponentName: opponentPlayer?.name ?? '(removed)',
        wins: record.wins,
        losses: record.losses,
        encounters: record.encounters,
      });
    }
    headToHead.sort((a, b) => b.encounters - a.encounters);

    // Get achievements
    const achievements = achievementsService.getPlayerAchievements(sessionId, playerId);

    const profile: PlayerProfile = {
      playerId,
      playerName: player.name,
      starRating: playerStat?.starRating ?? (3 as StarRating),
      rating: playerStat?.rating ?? 1000,
      wins: playerStat?.wins ?? 0,
      losses: playerStat?.losses ?? 0,
      matchesPlayed: playerStat?.matchesPlayed ?? 0,
      winRate: playerStat?.winRate ?? 0,
      streak: playerStat?.streak ?? 0,
      matchHistory,
      headToHead,
      achievements,
    };

    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Achievements Routes
// ============================================================

/**
 * GET /api/sessions/:sessionId/achievements — Get all session achievements
 */
app.get('/api/sessions/:sessionId/achievements', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const achievements = achievementsService.getSessionAchievementsAll(sessionId);
    res.json(achievements);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Error Handling Middleware
// ============================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ValidationError) {
    const status = mapValidationErrorToStatus(err);
    res.status(status).json({ error: err.message });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  // Unknown errors
  console.error('Unexpected error:', err.message, err.stack);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({ error: isDev ? `${err.name}: ${err.message}` : 'Internal server error' });
});

/**
 * Maps a ValidationError to the appropriate HTTP status code based on the
 * error message and fields, following the design document's error handling table.
 */
function mapValidationErrorToStatus(err: ValidationError): number {
  const msg = err.message;

  // 404 — Session not found
  if (msg.includes('Session not found')) {
    return 404;
  }

  // 404 — Fixed pair not found
  if (msg.includes('Fixed pair not found')) {
    return 404;
  }

  // 409 — Duplicate player name
  if (msg.includes('A player with this name already exists')) {
    return 409;
  }

  // 409 — Court already occupied
  if (msg.includes('Court is already occupied')) {
    return 409;
  }

  // 403 — Session has ended (check-in rejected)
  if (msg.includes('Session has ended') || msg.includes('after session has ended')) {
    return 403;
  }

  // 422 — Not enough players
  if (msg.includes('Not enough players')) {
    return 422;
  }

  // 400 — General validation errors (name, courtCount, playerName fields)
  return 400;
}

export default app;

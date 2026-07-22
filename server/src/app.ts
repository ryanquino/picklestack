import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import { createHash } from 'crypto';
import { ValidationError, NotFoundError } from './errors';
import * as sessionService from './services/sessionService';
import * as queueService from './services/queueService';
import * as courtService from './services/courtService';
import * as matchResultService from './services/matchResultService';
import * as achievementsService from './services/achievementsService';
import { computeSessionAwards } from './services/sessionAwardsService';
import { computeSessionHighlights } from './services/highlightsService';
import { determineMvp } from './services/leaderboardService';
import * as ratingService from './services/ratingService';
import * as fixedPairService from './services/fixedPairService';
import { computeSessionDiversity } from './services/diversityService';
import { computeWaitEstimates } from './services/queueEstimatorService';
import { computeMatchQuality, getSessionQualityMetrics } from './services/qualityScorerService';
import * as mlpTournament from './services/mlpTournamentService';
import * as repo from './repository';
import * as blogService from './services/blogService';
import {
  getActiveMatchByCourt,
  getActiveMatchesBySession,
  getPlayerById,
  getPlayersBySession,
  getQueueBySession,
  getCompletedMatchCountBySession,
  getSessionById,
  getMatchesByPlayerId,
  getMatchesBySession,
  getHeadToHeadRecords,
  getPlayerRatingsBySession,
  getMatchResultsBySession,
  updateSessionPairingMode,
  getPlayerRating,
  upsertPlayerRating,
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
    const { name, courtCount, courtName, sessionType, gameMode, matchingMode, sessionDurationHours, mlpConfig, clubRaidConfig } = req.body;
    sessionService.updateSessionSettings(sessionId, {
      name,
      courtCount,
      courtName: courtName ?? '',
      sessionType,
      gameMode,
      matchingMode,
      sessionDurationHours: sessionDurationHours ?? 4,
      mlpConfig: mlpConfig ?? undefined,
      clubRaidConfig: clubRaidConfig ?? undefined,
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
 * GET /api/sessions/:sessionId/join-info — Public endpoint for player self-check-in page
 * Returns minimal session info needed for the join screen.
 */
app.get('/api/sessions/:sessionId/join-info', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    if (session.status === 'ended') {
      res.status(410).json({ error: 'This session has ended. No new check-ins are accepted.' });
      return;
    }
    const playerCount = getPlayersBySession(sessionId).length;
    res.json({
      sessionId: session.id,
      name: session.name,
      status: session.status,
      gameMode: session.game_mode,
      matchingMode: session.matching_mode,
      playerCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/bench-players — Public endpoint for join page autocomplete.
 * Returns players who are in the session but not in queue and not in active matches.
 */
app.get('/api/sessions/:sessionId/bench-players', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    if (session.status === 'ended') {
      res.json([]);
      return;
    }

    const allPlayers = getPlayersBySession(sessionId);
    const queueEntries = getQueueBySession(sessionId);
    const queuePlayerIds = new Set<string>(queueEntries.map((e) => e.player_id));

    const activeMatches = getActiveMatchesBySession(sessionId);
    const activeMatchPlayerIds = new Set<string>();
    for (const match of activeMatches) {
      const pids: string[] = JSON.parse(match.player_ids);
      for (const pid of pids) activeMatchPlayerIds.add(pid);
    }

    // Exclude players in fixed pairs — they're effectively in queue even if
    // only the anchor has a queue_entries row.
    const pairedPlayerIds = new Set<string>();
    const fixedPairs = fixedPairService.getFixedPairsBySession(sessionId);
    for (const pair of fixedPairs) {
      pairedPlayerIds.add(pair.player1Id);
      pairedPlayerIds.add(pair.player2Id);
    }

    const benchPlayers = allPlayers
      .filter((p) => !queuePlayerIds.has(p.id) && !activeMatchPlayerIds.has(p.id) && !pairedPlayerIds.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
      }));

    res.json(benchPlayers);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/all-players — All players with status (bench, queue, playing).
 * Used for the partner autocomplete dropdown on the join page.
 */
app.get('/api/sessions/:sessionId/all-players', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    if (session.status === 'ended') {
      res.json([]);
      return;
    }

    const allPlayers = getPlayersBySession(sessionId);
    const queueEntries = getQueueBySession(sessionId);
    const queuePlayerIds = new Set<string>(queueEntries.map((e) => e.player_id));

    const activeMatches = getActiveMatchesBySession(sessionId);
    const activeMatchPlayerIds = new Set<string>();
    for (const match of activeMatches) {
      const pids: string[] = JSON.parse(match.player_ids);
      for (const pid of pids) activeMatchPlayerIds.add(pid);
    }

    // Players in fixed pairs are effectively "in queue" even if only the anchor
    // has a queue_entries row.  Build a set of all player IDs that belong to any
    // active fixed pair so we can report them correctly.
    const pairedPlayerIds = new Set<string>();
    const fixedPairs = fixedPairService.getFixedPairsBySession(sessionId);
    for (const pair of fixedPairs) {
      pairedPlayerIds.add(pair.player1Id);
      pairedPlayerIds.add(pair.player2Id);
    }

    // Fetch star ratings for all players in this session
    const db = getDb();
    const ratingRows = db.prepare(
      'SELECT player_id, star_rating FROM player_ratings WHERE session_id = ?'
    ).all(sessionId) as Array<{ player_id: string; star_rating: number }>;
    const starRatingMap = new Map(ratingRows.map(r => [r.player_id, r.star_rating]));

    const players = allPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      gender: p.gender ?? null,
      starRating: starRatingMap.get(p.id) ?? 3,
      status: activeMatchPlayerIds.has(p.id)
        ? 'playing'
        : (queuePlayerIds.has(p.id) || pairedPlayerIds.has(p.id))
          ? 'queue'
          : 'bench',
    }));

    res.json(players);
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

    // Get matching mode from the raw session row
    const sessionRow = getSessionById(sessionId)!;
    const sessionMatchingMode = sessionRow.matching_mode;

    // Batch-fetch all players once to avoid N+1 queries
    const allPlayers = getPlayersBySession(sessionId);
    const playerById = new Map(allPlayers.map(p => [p.id, p]));

    // Get player stats and achievements
    const playerStats = matchResultService.getPlayerStats(sessionId);
    const achievements = achievementsService.getSessionAchievementsAll(sessionId);

    // Build lastResult map for bracket labels
    const ratingRows = getPlayerRatingsBySession(sessionId);
    const lastResultMap = new Map<string, string | null>();
    for (const row of ratingRows) {
      lastResultMap.set(row.player_id, row.last_match_result);
    }

    const matches = activeMatches.map((match: MatchRow) => {
      const playerIds = JSON.parse(match.player_ids) as string[];
      let team1Bracket: string | null = null;
      let team2Bracket: string | null = null;

      // For comeback mode: use stored bracket assignment from pairing
      if (playerIds.length >= 4 && sessionMatchingMode === 'comeback' && match.assigned_bracket) {
        team1Bracket = match.assigned_bracket;
        team2Bracket = match.assigned_bracket;
      }

      return {
        id: match.id,
        sessionId: match.session_id,
        courtNumber: match.court_number,
        playerIds,
        players: playerIds.map((playerId) => {
          const player = playerById.get(playerId);
          return player ? { id: player.id, name: player.name } : { id: playerId, name: '(removed)' };
        }),
        status: match.status,
        startedAt: match.started_at,
        completedAt: match.completed_at,
        team1Bracket,
        team2Bracket,
      };
    });

    // Compute session intelligence data
    const diversityMap = computeSessionDiversity(sessionId);
    const diversity: Record<string, number> = Object.fromEntries(diversityMap);

    // Determine MVP using shared algorithm
    const mvpPlayerId = determineMvp(playerStats);

    const waitEstimatesList = computeWaitEstimates(sessionId);
    const waitEstimates: Record<string, number | null> = {};
    for (const entry of waitEstimatesList) {
      waitEstimates[entry.playerId] = entry.estimatedMinutes;
    }

    const qualityMetrics = getSessionQualityMetrics(sessionId);

    // Compute bench players (in session but not in queue and not in active match)
    const queuePlayerIds = new Set<string>();
    for (const e of queue) {
      queuePlayerIds.add((e as any).playerId);
      // For pair slots, also exclude the partner
      if ((e as any).partnerPlayerId) {
        queuePlayerIds.add((e as any).partnerPlayerId);
      }
    }
    const activeMatchPlayerIds = new Set<string>();
    for (const match of activeMatches) {
      const pids: string[] = JSON.parse(match.player_ids);
      for (const pid of pids) activeMatchPlayerIds.add(pid);
    }
    const statsMap = new Map(playerStats.map(s => [s.playerId, s]));
    const benchPlayers = allPlayers
      .filter(p => !queuePlayerIds.has(p.id) && !activeMatchPlayerIds.has(p.id))
      .map(p => {
        const stats = statsMap.get(p.id);
        return {
          id: p.id,
          name: p.name,
          gender: p.gender ?? null,
          starRating: stats?.starRating ?? 3,
          wins: stats?.wins ?? 0,
          losses: stats?.losses ?? 0,
          matchesPlayed: stats?.matchesPlayed ?? 0,
        };
      });

    const totalCompleted = getCompletedMatchCountBySession(sessionId);
    const fixedPairs = fixedPairService.getFixedPairsBySession(sessionId);
    const payload = {
      session: {
        ...session,
        pairingMode: sessionRow.pairing_mode,
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
      fixedPairs,
      sessionAwards: computeSessionAwards(sessionId),
      highlights: computeSessionHighlights(sessionId),
      benchPlayers,
      mvpPlayerId,
      totalCompletedMatches: totalCompleted,
      nextMatchPlayerIds: courtService.previewNextMatch(sessionId),
      diversity,
      waitEstimates,
      qualityMetrics,
      ...(session.status === 'ended' ? {
        summary: {
          totalPlayersCheckedIn: allPlayers.length,
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
                const p = playerById.get(pid);
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
    };

    const etagInput = `${session.updatedAt}:${totalCompleted}:${queue.length}:${matches.length}:${playerStats.length}`;
    const etag = `"${createHash('md5').update(etagInput).digest('hex')}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.json(payload);
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

    // Batch-fetch all players once to avoid N+1 queries
    const allPlayers = getPlayersBySession(sessionId);
    const playerById = new Map(allPlayers.map(p => [p.id, p]));

    // Get last match result for each player (for comeback bracket sorting)
    const ratingRows = getPlayerRatingsBySession(sessionId);
    const lastResultMap = new Map<string, string | null>();
    for (const row of ratingRows) {
      lastResultMap.set(row.player_id, row.last_match_result);
    }

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

    // Determine MVP using shared algorithm
    const mvpPlayerId = determineMvp(playerStats);

    // Format queue with "up next" marking for first 4, plus player stats
    const formattedQueue = queue.map((entry, index) => {
      const stats = statsMap.get(entry.playerId);
      return {
        playerId: entry.playerId,
        playerName: entry.playerName,
        position: entry.position,
        isPairSlot: entry.isPairSlot,
        pairId: entry.pairId,
        partnerPlayerId: entry.partnerPlayerId,
        partnerPlayerName: entry.partnerPlayerName,
        isUpNext: index < 4,
        rating: stats?.rating ?? 1000,
        starRating: stats?.starRating ?? 3,
        wins: stats?.wins ?? 0,
        losses: stats?.losses ?? 0,
        winRate: stats?.winRate ?? 0,
        streak: stats?.streak ?? 0,
        isMvp: entry.playerId === mvpPlayerId,
        achievements: achievementsByPlayer.get(entry.playerId) || [],
        queuedAt: entry.queuedAt,
        lastResult: (lastResultMap.get(entry.playerId) ?? null) as 'win' | 'loss' | null,
      };
    });

    const matches = activeMatches.map((match: MatchRow) => ({
      id: match.id,
      courtNumber: match.court_number,
      players: (JSON.parse(match.player_ids) as string[]).map((playerId) => {
        const player = playerById.get(playerId);
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

    // Include completed match log for all sessions (active or ended)
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

    {
      const allMatches = getMatchesBySession(sessionId);
      const resultRows = getMatchResultsBySession(sessionId);
      const resultByMatchId = new Map(resultRows.map(r => [r.match_id, r]));

      completedMatches = allMatches
        .filter(m => m.status === 'completed')
        .map(m => {
          const result = resultByMatchId.get(m.id);
          const playerIds: string[] = JSON.parse(m.player_ids);
          const playerNames = playerIds.map(pid => {
            const p = playerById.get(pid);
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

    // Build response
    const totalCompletedMatches = getCompletedMatchCountBySession(sessionId);
    const payload = {
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
      sessionAwards: computeSessionAwards(sessionId),
      highlights: computeSessionHighlights(sessionId),
      completedMatches: session.status === 'ended' ? completedMatches : [],
      totalCompletedMatches,
      waitEstimates,
      mvpPlayerId,
      nextMatchPlayerIds: courtService.previewNextMatch(sessionId),
      onDeckPlayerIds: getOnDeckPlayerIds(
        queue.map(e => ({ playerId: e.playerId, position: e.position })),
        (session.gameMode || 'doubles') as 'doubles' | 'singles',
        (session.matchingMode || 'balanced') as 'casual' | 'balanced' | 'competitive' | 'queue'
      ),
      ...(session.matchingMode === 'club_raid' ? {
        clubRaid: {
          players: allPlayers.map(p => ({ id: p.id, name: p.name })),
        },
      } : {}),
    };

    // ETag based on session state — returns 304 when nothing changed
    const etagInput = `${session.updatedAt}:${totalCompletedMatches}:${queue.length}:${activeMatches.length}:${playerStats.length}`;
    const etag = `"${createHash('md5').update(etagInput).digest('hex')}"`;
    res.setHeader('ETag', etag);
    // stale-while-revalidate: browser uses cache for 5s, then shows stale while fetching fresh
    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.json(payload);
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
    const { name, starRating, skipQueue, partnerId, gender } = req.body;

    // Validate starRating if provided
    if (starRating !== undefined && (![1, 2, 3, 4, 5].includes(starRating))) {
      throw new ValidationError('Star rating must be between 1 and 5', ['starRating']);
    }

    let player;
    if (skipQueue) {
      // Add player to session without adding to queue (bench player)
      player = queueService.addPlayerToSession(sessionId, name, gender);
    } else {
      player = queueService.addPlayer(sessionId, name, gender);
    }

    // Initialize player rating based on star rating
    ratingService.initializePlayerRating(sessionId, player.id, starRating as StarRating | undefined);

    // If a partner was specified, attempt to create a fixed pair
    let pair = null;
    let pairError: string | null = null;
    if (partnerId && !skipQueue) {
      try {
        pair = fixedPairService.createFixedPair(sessionId, player.id, partnerId);
      } catch (err) {
        // Pairing may fail (partner already paired, in match, etc.)
        // Player is still checked in — surface the reason to the client
        pairError = err instanceof Error ? err.message : 'Pairing failed';
      }
    }

    res.status(201).json({ ...player, pairId: pair?.id ?? null, pairError });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/players/:playerId/join-queue — Move a bench player into the queue
 */
app.post('/api/sessions/:sessionId/players/:playerId/join-queue', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const playerId = req.params.playerId as string;
    const { starRating } = req.body ?? {};

    queueService.addPlayerToQueue(sessionId, playerId);

    if (starRating !== undefined && [1, 2, 3, 4, 5].includes(starRating)) {
      const existing = getPlayerRating(playerId, sessionId);
      if (existing) {
        upsertPlayerRating({ ...existing, star_rating: starRating });
      } else {
        ratingService.initializePlayerRating(sessionId, playerId, starRating as StarRating);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/players/:playerId/status — Lightweight bench check.
 * Returns { status: 'bench' | 'queue' | 'playing' | 'not-found' }
 */
app.get('/api/sessions/:sessionId/players/:playerId/status', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const playerId = req.params.playerId as string;

    const session = getSessionById(sessionId);
    if (!session || session.status === 'ended') {
      res.json({ status: 'not-found' });
      return;
    }

    const player = getPlayerById(playerId);
    if (!player) {
      res.json({ status: 'not-found' });
      return;
    }

    const queueEntries = getQueueBySession(sessionId);
    if (queueEntries.some((e) => e.player_id === playerId)) {
      res.json({ status: 'queue' });
      return;
    }

    // Non-anchor players in a fixed pair don't have their own queue entry
    // but are effectively in queue.
    const fixedPair = fixedPairService.getFixedPairByPlayerId(sessionId, playerId);
    if (fixedPair) {
      res.json({ status: 'queue' });
      return;
    }

    const activeMatches = getActiveMatchesBySession(sessionId);
    for (const match of activeMatches) {
      const pids: string[] = JSON.parse(match.player_ids);
      if (pids.includes(playerId)) {
        res.json({ status: 'playing' });
        return;
      }
    }

    res.json({ status: 'bench' });
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
    const allPlayers = getPlayersBySession(sessionId);
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    // Enrich with player names
    const enriched = pairs.map(pair => {
      const p1 = playerById.get(pair.player1Id);
      const p2 = playerById.get(pair.player2Id);
      return {
        ...pair,
        player1Name: p1 ? p1.name : '(removed)',
        player2Name: p2 ? p2.name : '(removed)',
      };
    });
    res.status(200).json(enriched);
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
 * POST /api/sessions/:sessionId/courts/:courtNumber/start-manual — Start a match with manually selected players
 */
app.post('/api/sessions/:sessionId/courts/:courtNumber/start-manual', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const courtNumber = parseInt(req.params.courtNumber as string, 10);
    const { playerIds } = req.body;
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      throw new ValidationError('playerIds array is required', ['playerIds']);
    }
    const match = courtService.startMatchManual(sessionId, courtNumber, playerIds);
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

    // If this is a club raid match, update the club_raid_matches record
    if (activeMatch) {
      try {
        const cramRows = repo.getClubRaidMatchesBySession(sessionId);
        const cramMatch = cramRows.find(r => r.match_id === activeMatch.id);
        if (cramMatch && cramMatch.status !== 'completed') {
          const playerIds: string[] = JSON.parse(activeMatch.player_ids);
          let derivedWinningTeam = winningTeam;
          // Derive winner from scores when no explicit winning team was sent
          if (!derivedWinningTeam && team1Score != null && team2Score != null) {
            derivedWinningTeam = team1Score >= team2Score ? 'team1' : 'team2';
          }
          const winningPlayerIds = derivedWinningTeam === 'team1' ? playerIds.slice(0, 2) : playerIds.slice(2, 4);
          const clubAPlayers = new Set([cramMatch.club_a_player_1, cramMatch.club_a_player_2].filter(Boolean));
          const clubAWinners = winningPlayerIds.filter(pid => clubAPlayers.has(pid)).length;
          const winnerClubId = clubAWinners > 0 ? cramMatch.club_a_id : cramMatch.club_b_id;
          repo.updateClubRaidMatch(cramMatch.id, {
            status: 'completed',
            winner_club_id: winnerClubId,
          });
        }
      } catch (clubRaidErr) {
        console.error('Failed to update club raid match result:', clubRaidErr);
      }
    }

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

    // Determine MVP using shared algorithm
    const mvpPlayerId = determineMvp(playerStats);

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
    const { winningTeam, team1Score, team2Score } = req.body;

    // Validate session exists
    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Validate session not ended
    if (session.status === 'ended') {
      throw new ValidationError('Cannot update results after session has ended', ['sessionId']);
    }

    // Validate winningTeam if provided
    if (winningTeam !== undefined && winningTeam !== 'team1' && winningTeam !== 'team2') {
      throw new ValidationError("winningTeam must be 'team1' or 'team2'", ['winningTeam']);
    }

    // Validate scores if provided (both must be present)
    let parsedTeam1: number | undefined;
    let parsedTeam2: number | undefined;
    if (team1Score !== undefined || team2Score !== undefined) {
      if (team1Score === undefined || team2Score === undefined) {
        throw new ValidationError('Both team1Score and team2Score are required to update scores', [
          'team1Score',
          'team2Score',
        ]);
      }
      parsedTeam1 = Number(team1Score);
      parsedTeam2 = Number(team2Score);
      if (!Number.isInteger(parsedTeam1) || !Number.isInteger(parsedTeam2) ||
          parsedTeam1 < 0 || parsedTeam2 < 0) {
        throw new ValidationError('Scores must be non-negative integers', [
          'team1Score',
          'team2Score',
        ]);
      }
    }

    const result = matchResultService.updateMatchResult(matchId, {
      winningTeam,
      team1Score: parsedTeam1,
      team2Score: parsedTeam2,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/match-results — List all completed match results
 * for the session, with match (court, players) and score/winner info. Used by the
 * Results panel so admins can review and correct scores/winners.
 */
app.get('/api/sessions/:sessionId/match-results', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;

    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const players = getPlayersBySession(sessionId);
    const playerName = new Map(players.map(p => [p.id, p.name]));

    const matches = getMatchesBySession(sessionId);
    const matchById = new Map(matches.map(m => [m.id, m]));
    const matchNumberMap = new Map<string, number>();
    matches.forEach((m, idx) => { matchNumberMap.set(m.id, idx + 1); });

    const resultRows = getMatchResultsBySession(sessionId);

    const results = resultRows
      .map(row => {
        const match = matchById.get(row.match_id);
        if (!match) return null;
        const playerIds: string[] = JSON.parse(match.player_ids);
        const winnerIds: string[] = JSON.parse(row.winner_player_ids);
        const loserIds: string[] = JSON.parse(row.loser_player_ids);
        const half = Math.floor(playerIds.length / 2);
        const team1Ids = playerIds.slice(0, half);
        const team2Ids = playerIds.slice(half);
        const winningTeam: 'team1' | 'team2' =
          winnerIds.every(id => team1Ids.includes(id)) ? 'team1' : 'team2';

        return {
          matchId: match.id,
          matchIndex: matchNumberMap.get(match.id) ?? 0,
          courtNumber: match.court_number,
          status: match.status,
          playerIds,
          playerNames: playerIds.map(id => playerName.get(id) ?? 'Unknown'),
          team1PlayerIds: team1Ids,
          team2PlayerIds: team2Ids,
          team1Score: row.team1_score,
          team2Score: row.team2_score,
          winningTeam,
          recordedAt: row.recorded_at,
          updatedAt: row.updated_at,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json(results);
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

    // Determine MVP using shared algorithm
    const mvpPlayerId = determineMvp(sorted);

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

    const allSessionMatches = getMatchesBySession(sessionId);
    const matchNumberMap = new Map<string, number>();
    allSessionMatches.forEach((m, idx) => { matchNumberMap.set(m.id, idx + 1); });

    const history: MatchHistoryEntry[] = matches.map(match => {
      const playerIds: string[] = JSON.parse(match.player_ids);
      const half = Math.floor(playerIds.length / 2);
      const team1 = playerIds.slice(0, half);
      const team2 = playerIds.slice(half);
      const onTeam1 = team1.includes(playerId);
      const teammateIds = onTeam1 ? team1.filter(id => id !== playerId) : team2.filter(id => id !== playerId);
      const opponentIds = onTeam1 ? team2 : team1;

      const matchResult = resultByMatchId.get(match.id);
      let result: 'win' | 'loss' | 'skipped' = 'skipped';
      if (matchResult) {
        const winnerIds: string[] = JSON.parse(matchResult.winner_player_ids);
        result = winnerIds.includes(playerId) ? 'win' : 'loss';
      }

      return {
        matchId: match.id,
        matchIndex: matchNumberMap.get(match.id) ?? 0,
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
    const allPlayers = getPlayersBySession(sessionId);
    const playerById = new Map(allPlayers.map(p => [p.id, p]));

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
      const opponentPlayer = playerById.get(opponentId);
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

    // Get all session matches to compute match numbers
    const allSessionMatches = getMatchesBySession(sessionId);
    const matchNumberMap = new Map<string, number>();
    allSessionMatches.forEach((m, idx) => { matchNumberMap.set(m.id, idx + 1); });

    const matchHistory: MatchHistoryEntry[] = matches.map(match => {
      const playerIds: string[] = JSON.parse(match.player_ids);
      const half = Math.floor(playerIds.length / 2);
      const team1 = playerIds.slice(0, half);
      const team2 = playerIds.slice(half);
      const onTeam1 = team1.includes(playerId);
      const teammateIds = onTeam1 ? team1.filter(id => id !== playerId) : team2.filter(id => id !== playerId);
      const opponentIds = onTeam1 ? team2 : team1;

      const matchResult = resultByMatchId.get(match.id);
      let result: 'win' | 'loss' | 'skipped' = 'skipped';
      if (matchResult) {
        const winnerIds: string[] = JSON.parse(matchResult.winner_player_ids);
        result = winnerIds.includes(playerId) ? 'win' : 'loss';
      }

      return {
        matchId: match.id,
        matchIndex: matchNumberMap.get(match.id) ?? 0,
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

    // Batch-fetch players for head-to-head name resolution
    const allSessionPlayers = getPlayersBySession(sessionId);
    const playerByIdForH2H = new Map(allSessionPlayers.map(p => [p.id, p]));

    const headToHead: HeadToHeadRecord[] = [];
    for (const [opponentId, record] of opponentMap) {
      if (record.encounters === 0) continue;
      const opponentPlayer = playerByIdForH2H.get(opponentId);
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

/**
 * PUT /api/sessions/:sessionId/players/:playerId/star-rating — Update a player's star rating
 */
app.put('/api/sessions/:sessionId/players/:playerId/star-rating', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const playerId = req.params.playerId as string;
    const { starRating } = req.body;

    if (![1, 2, 3, 4, 5].includes(starRating)) {
      throw new ValidationError('Star rating must be between 1 and 5', ['starRating']);
    }

    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const player = getPlayerById(playerId);
    if (!player || player.session_id !== sessionId) {
      throw new NotFoundError('Player not found in this session');
    }

    // Update the star rating (re-initialize preserves matches/wins/losses if already exists)
    const existing = getPlayerRating(playerId, sessionId);
    if (existing) {
      upsertPlayerRating({
        ...existing,
        star_rating: starRating,
      });
    } else {
      ratingService.initializePlayerRating(sessionId, playerId, starRating as StarRating);
    }

    res.json({ success: true, starRating });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sessions/:sessionId/players/:playerId/gender — Update a player's gender
 */
app.put('/api/sessions/:sessionId/players/:playerId/gender', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const playerId = req.params.playerId as string;
    const { gender } = req.body;

    if (gender !== null && gender !== 'male' && gender !== 'female') {
      throw new ValidationError('Gender must be "male", "female", or null', ['gender']);
    }

    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const player = getPlayerById(playerId);
    if (!player || player.session_id !== sessionId) {
      throw new NotFoundError('Player not found in this session');
    }

    const db = getDb();
    db.prepare('UPDATE players SET gender = ? WHERE id = ?').run(gender, playerId);

    res.json({ success: true, gender });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sessions/:sessionId/players/gender-bulk — Bulk update player genders
 */
app.put('/api/sessions/:sessionId/players/gender-bulk', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      throw new ValidationError('Requires updates array of { playerId, gender }', ['updates']);
    }

    const session = getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const db = getDb();
    const allPlayers = getPlayersBySession(sessionId);
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    const stmt = db.prepare('UPDATE players SET gender = ? WHERE id = ?');
    let count = 0;
    for (const u of updates) {
      if (u.gender !== null && u.gender !== 'male' && u.gender !== 'female') continue;
      const player = playerById.get(u.playerId);
      if (!player || player.session_id !== sessionId) continue;
      stmt.run(u.gender, u.playerId);
      count++;
    }

    res.json({ success: true, updated: count });
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
// MLP Tournament Routes
// ============================================================

/**
 * GET /api/sessions/:sessionId/tournament — Get full tournament state
 */
app.get('/api/sessions/:sessionId/tournament', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const teams = mlpTournament.getTeams(sessionId);
    const brackets = mlpTournament.getBrackets(sessionId);
    const config = mlpTournament.getMLPConfig(sessionId);
    const isComplete = mlpTournament.isTournamentComplete(sessionId);
    const champion = mlpTournament.getChampion(sessionId);
    const rankings = mlpTournament.getTournamentRankings(sessionId);

    // Enrich teams with player names
    const players = getPlayersBySession(sessionId);
    const playerMap = new Map(players.map((p: any) => [p.id, p.name]));
    const enrichedTeams = teams.map((t: any) => ({
      ...t,
      player1Name: playerMap.get(t.player1Id) ?? 'Unknown',
      player2Name: playerMap.get(t.player2Id) ?? 'Unknown',
      player3Name: playerMap.get(t.player3Id) ?? 'Unknown',
      player4Name: playerMap.get(t.player4Id) ?? 'Unknown',
    }));

    // Enrich brackets with team names and court numbers
    const teamMap = new Map(teams.map((t: any) => [t.id, t.name]));
    const bracketMatchIds = brackets.filter((b: any) => b.matchId).map((b: any) => b.matchId);
    const courtByMatch = new Map<string, number>();
    if (bracketMatchIds.length > 0) {
      const db = getDb();
      const placeholders = bracketMatchIds.map(() => '?').join(',');
      const matchRows = db.prepare(`SELECT id, court_number FROM matches WHERE id IN (${placeholders})`).all(...bracketMatchIds) as Array<{ id: string; court_number: number }>;
      for (const row of matchRows) {
        courtByMatch.set(row.id, row.court_number);
      }
    }
    const enrichedBrackets = brackets.map((b: any) => ({
      ...b,
      teamAName: b.teamAId ? teamMap.get(b.teamAId) ?? null : null,
      teamBName: b.teamBId ? teamMap.get(b.teamBId) ?? null : null,
      winnerTeamName: b.winnerTeamId ? teamMap.get(b.winnerTeamId) ?? null : null,
      courtNumber: b.matchId ? (courtByMatch.get(b.matchId) ?? null) : null,
    }));

    // Get match results
    const results = mlpTournament.getAllMLPMatchResults(sessionId);

    res.json({
      config,
      teams: enrichedTeams,
      brackets: enrichedBrackets,
      results,
      isComplete,
      champion: champion ? {
        ...champion,
        player1Name: playerMap.get(champion.player1Id) ?? 'Unknown',
        player2Name: playerMap.get(champion.player2Id) ?? 'Unknown',
        player3Name: playerMap.get(champion.player3Id) ?? 'Unknown',
        player4Name: playerMap.get(champion.player4Id) ?? 'Unknown',
      } : null,
      rankings: rankings.map((r: any) => ({
        rank: r.rank,
        team: {
          ...r.team,
          player1Name: playerMap.get(r.team.player1Id) ?? 'Unknown',
          player2Name: playerMap.get(r.team.player2Id) ?? 'Unknown',
          player3Name: playerMap.get(r.team.player3Id) ?? 'Unknown',
          player4Name: playerMap.get(r.team.player4Id) ?? 'Unknown',
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/tournament/teams — Create a team manually
 */
app.post('/api/sessions/:sessionId/tournament/teams', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const { name, playerIds, seed } = req.body;
    if (!name || !Array.isArray(playerIds) || playerIds.length !== 4) {
      throw new ValidationError('Team requires a name and exactly 4 player IDs', ['name', 'playerIds']);
    }

    const team = mlpTournament.createTeam(sessionId, name, playerIds as [string, string, string, string], seed ?? 1);
    res.status(201).json(team);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/tournament/teams/random — Create teams randomly from player pools
 */
app.post('/api/sessions/:sessionId/tournament/teams/random', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const { teamCount, malePlayerIds, femalePlayerIds } = req.body;
    if (!teamCount || !Array.isArray(malePlayerIds) || !Array.isArray(femalePlayerIds)) {
      throw new ValidationError('Requires teamCount, malePlayerIds, and femalePlayerIds', ['teamCount', 'malePlayerIds', 'femalePlayerIds']);
    }

    const teams = mlpTournament.createTeamsRandom(sessionId, teamCount, malePlayerIds, femalePlayerIds);
    res.status(201).json(teams);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sessions/:sessionId/tournament/teams/:teamId — Update a team
 */
app.put('/api/sessions/:sessionId/tournament/teams/:teamId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = req.params.teamId as string;
    const { name, playerIds } = req.body;

    const team = mlpTournament.updateTeam(teamId, { name, playerIds: playerIds as [string, string, string, string] | undefined });
    if (!team) throw new NotFoundError('Team not found');
    res.json(team);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/sessions/:sessionId/tournament/teams — Delete all teams
 */
app.delete('/api/sessions/:sessionId/tournament/teams', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    mlpTournament.deleteTeams(sessionId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/sessions/:sessionId/tournament/teams/:teamId — Delete a single team
 */
app.delete('/api/sessions/:sessionId/tournament/teams/:teamId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = req.params.teamId as string;
    mlpTournament.deleteTeam(teamId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/tournament/bracket — Generate bracket
 */
app.post('/api/sessions/:sessionId/tournament/bracket', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const { teamIds } = req.body;
    if (!Array.isArray(teamIds) || teamIds.length < 2) {
      throw new ValidationError('Need at least 2 team IDs to generate a bracket', ['teamIds']);
    }

    const brackets = mlpTournament.generateBracket(sessionId, teamIds);
    res.status(201).json(brackets);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/tournament/fix — Fix existing bracket byes
 */
app.post('/api/sessions/:sessionId/tournament/fix', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const changed = mlpTournament.fixSemifinalByes(sessionId);
    res.json({ changed });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/tournament/advance — Start the next round
 */
app.post('/api/sessions/:sessionId/tournament/advance', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const brackets = mlpTournament.startNextRound(sessionId);
    res.json(brackets);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/tournament/match/:bracketId/complete — Complete an MLP match
 */
app.post('/api/sessions/:sessionId/tournament/match/:bracketId/complete', (req: Request, res: Response, next: NextFunction) => {
  try {
    const bracketId = req.params.bracketId as string;
    const { matchId, subGames, winnerTeamId, dreamBreakerPlayed } = req.body;

    if (!matchId || !Array.isArray(subGames) || !winnerTeamId) {
      throw new ValidationError('Requires matchId, subGames array, and winnerTeamId', ['matchId', 'subGames', 'winnerTeamId']);
    }

    const result = mlpTournament.completeMLPMatch(matchId, bracketId, subGames, winnerTeamId, dreamBreakerPlayed ?? false);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sessions/:sessionId/tournament/match/:bracketId — Update a completed match
 */
app.put('/api/sessions/:sessionId/tournament/match/:bracketId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const bracketId = req.params.bracketId as string;
    const { subGames, winnerTeamId, dreamBreakerPlayed } = req.body;

    if (!Array.isArray(subGames) || !winnerTeamId) {
      throw new ValidationError('Requires subGames array and winnerTeamId', ['subGames', 'winnerTeamId']);
    }

    const result = mlpTournament.updateMLPMatch(bracketId, subGames, winnerTeamId, dreamBreakerPlayed ?? false);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/tournament/start — Start next match on an available court
 */
app.post('/api/sessions/:sessionId/tournament/start', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { courtNumber } = req.body;

    if (!courtNumber) {
      throw new ValidationError('Requires courtNumber', ['courtNumber']);
    }

    // Find the next match to schedule
    const nextBracket = mlpTournament.getNextMatch(sessionId);
    if (!nextBracket) {
      throw new ValidationError('No matches available to start', ['bracketId']);
    }

    // Get team player IDs
    const teamA = mlpTournament.getTeam(nextBracket.teamAId!);
    const teamB = mlpTournament.getTeam(nextBracket.teamBId!);
    if (!teamA || !teamB) {
      throw new ValidationError('Teams not found for this match', ['teamAId', 'teamBId']);
    }

    // Create the match with all 8 player IDs (teamA then teamB)
    const playerIds = [
      teamA.player1Id, teamA.player2Id, teamA.player3Id, teamA.player4Id,
      teamB.player1Id, teamB.player2Id, teamB.player3Id, teamB.player4Id,
    ];

    // Start the match using the existing court service
    const match = courtService.startMatchManual(sessionId, courtNumber, playerIds);

    // Link the match to the bracket
    const db = getDb();
    db.prepare('UPDATE tournament_brackets SET match_id = ? WHERE id = ?').run(match.id, nextBracket.id);

    res.status(201).json({ match, bracket: { ...nextBracket, matchId: match.id } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Club Raid Routes
// ============================================================

import * as clubRaidService from './services/clubRaidService';

/**
 * TEMPORARY DEBUG ENDPOINT
 * GET /api/debug/live-sessions — List current live (active) sessions so the
 * organizer can jump straight into any session's Organizer Dashboard.
 * Query params:
 *   activeOnly (default "true") — set to "false" to also include ended sessions.
 * Returns, for each session: id, name, status, matchingMode, courtCount,
 * createdAt, updatedAt, and ready-to-use dashboardUrl / liveUrl.
 * TODO: remove this endpoint before shipping.
 */
app.get('/api/debug/live-sessions', (req: Request, res: Response, next: NextFunction) => {
  try {
    const activeOnly = req.query.activeOnly !== 'false';
    const sessions = repo.listSessions(activeOnly);
    res.json({
      count: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        matchingMode: s.matching_mode,
        courtCount: s.court_count,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        dashboardUrl: `/session/${s.id}`,
        liveUrl: `/live/${s.id}`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/club-raid/clubs — Create clubs for a session
 */
app.post('/api/sessions/:sessionId/club-raid/clubs', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (session.status === 'ended') throw new ValidationError('Session has ended', ['sessionId']);

    const { clubCount, clubSize } = req.body;
    if (!clubCount || clubCount < 2 || clubCount > 6) {
      throw new ValidationError('Club count must be between 2 and 6', ['clubCount']);
    }
    if (!clubSize || clubSize < 2 || clubSize > 6) {
      throw new ValidationError('Club size must be between 2 and 6', ['clubSize']);
    }

    // Delete existing clubs if reconfiguring
    clubRaidService.deleteSessionData(sessionId);

    const clubs = clubRaidService.createClubs(sessionId, { clubCount, clubSize });

    // Store config on session
    const config = JSON.stringify({ clubCount, clubSize });
    const db = getDb();
    db.prepare('UPDATE sessions SET club_raid_config = ? WHERE id = ?').run(config, sessionId);

    res.status(201).json({ clubs });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/club-raid/clubs — Get clubs for a session
 */
app.get('/api/sessions/:sessionId/club-raid/clubs', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const clubs = clubRaidService.getClubs(sessionId);
    res.json({ clubs });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/club-raid/clubs/:clubId/players — Add player to club
 */
app.post('/api/sessions/:sessionId/club-raid/clubs/:clubId/players', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const clubId = req.params.clubId as string;
    const { playerId } = req.body;

    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (session.status === 'ended') throw new ValidationError('Session has ended', ['sessionId']);

    const club = repo.getClubById(clubId);
    if (!club) throw new NotFoundError('Club not found');

    // Check club size limit
    const config = session.club_raid_config ? JSON.parse(session.club_raid_config) : null;
    if (config) {
      const members = repo.getClubMembersByClub(clubId);
      if (members.length >= config.clubSize) {
        throw new ValidationError('Club is full', ['clubId']);
      }
    }

    // Remove player from any other club in this session first
    clubRaidService.removePlayerFromClubs(sessionId, playerId);

    const member = clubRaidService.addPlayerToClub(clubId, playerId);
    res.status(201).json({ member });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/sessions/:sessionId/club-raid/clubs/:clubId/players/:playerId — Remove player from club
 */
app.delete('/api/sessions/:sessionId/club-raid/clubs/:clubId/players/:playerId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const clubId = req.params.clubId as string;
    const playerId = req.params.playerId as string;

    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    repo.removeClubMember(clubId, playerId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/club-raid/auto-assign — Auto-assign players to clubs
 */
app.post('/api/sessions/:sessionId/club-raid/auto-assign', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const sessionRow = repo.getSessionById(sessionId);
    if (!sessionRow) throw new NotFoundError('Session not found');
    if (sessionRow.status === 'ended') throw new ValidationError('Session has ended', ['sessionId']);

    // Use provided config or fall back to stored config
    let config = req.body.clubCount && req.body.clubSize
      ? { clubCount: req.body.clubCount, clubSize: req.body.clubSize }
      : sessionRow.club_raid_config ? JSON.parse(sessionRow.club_raid_config) : null;
    if (!config) throw new ValidationError('Club Raid config not found. Provide clubCount and clubSize.', ['sessionId']);

    // Get all checked-in players
    const players = repo.getPlayersBySession(sessionId);

    // Clear existing assignments
    clubRaidService.deleteSessionData(sessionId);
    clubRaidService.createClubs(sessionId, { clubCount: config.clubCount, clubSize: config.clubSize });

    // Get fresh clubs
    const freshClubs = clubRaidService.getClubs(sessionId);

    // Shuffle players for random assignment
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    // Track local member counts (DB writes don't update in-memory club.members)
    const memberCounts = new Map<string, number>();
    for (const club of freshClubs) {
      memberCounts.set(club.id, 0);
    }

    // Assign players round-robin to clubs
    for (let i = 0; i < shuffled.length; i++) {
      const clubIndex = i % freshClubs.length;
      const club = freshClubs[clubIndex];

      // Check if club is full using local counter
      const currentCount = memberCounts.get(club.id) ?? 0;
      if (currentCount < config.clubSize) {
        clubRaidService.addPlayerToClub(club.id, shuffled[i].id);
        memberCounts.set(club.id, currentCount + 1);
      }
    }

    const result = clubRaidService.getClubs(sessionId);
    res.json({ clubs: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/club-raid/generate-schedule — Generate round-robin schedule
 */
app.post('/api/sessions/:sessionId/club-raid/generate-schedule', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (session.status === 'ended') throw new ValidationError('Session has ended', ['sessionId']);

    const clubs = clubRaidService.getClubs(sessionId);
    if (clubs.length < 2) throw new ValidationError('Need at least 2 clubs to generate schedule', ['sessionId']);

    const matches = clubRaidService.generateRoundRobinSchedule(sessionId, clubs);
    const clubSize = repo.getClubMembersByClub(clubs[0].id).length;
    res.status(201).json({ matches, totalRounds: clubs.length - 1, subMatchesPerRound: Math.floor(clubSize / 2) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/club-raid/add-round — Generate one additional round
 */
app.post('/api/sessions/:sessionId/club-raid/add-round', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (session.status === 'ended') throw new ValidationError('Session has ended', ['sessionId']);

    const clubs = clubRaidService.getClubs(sessionId);
    if (clubs.length < 2) throw new ValidationError('Need at least 2 clubs', ['sessionId']);

    const matches = clubRaidService.generateNextRound(sessionId);
    res.status(201).json({ matches });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/club-raid/schedule — Get the round-robin schedule
 */
app.get('/api/sessions/:sessionId/club-raid/schedule', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const rows = repo.getClubRaidMatchesBySession(sessionId);
    const raidPlayers = getPlayersBySession(sessionId);
    const raidPlayerById = new Map(raidPlayers.map(p => [p.id, p]));
    const matches = rows.map(m => {
      const getPlayerName = (id: string | null) => {
        if (!id) return null;
        const p = raidPlayerById.get(id);
        return p?.name ?? null;
      };
      // Fetch score from match_results if match is completed
      let team1Score: number | null = null;
      let team2Score: number | null = null;
      if (m.match_id) {
        const result = repo.getMatchResultByMatchId(m.match_id);
        if (result) {
          team1Score = result.team1_score;
          team2Score = result.team2_score;
        }
      }
      return {
        id: m.id,
        sessionId: m.session_id,
        round: m.round,
        clubAId: m.club_a_id,
        clubBId: m.club_b_id,
        clubAPlayer1: m.club_a_player_1,
        clubAPlayer2: m.club_a_player_2,
        clubBPlayer1: m.club_b_player_1,
        clubBPlayer2: m.club_b_player_2,
        clubAPlayer1Name: getPlayerName(m.club_a_player_1),
        clubAPlayer2Name: getPlayerName(m.club_a_player_2),
        clubBPlayer1Name: getPlayerName(m.club_b_player_1),
        clubBPlayer2Name: getPlayerName(m.club_b_player_2),
        matchId: m.match_id,
        status: m.status,
        winnerClubId: m.winner_club_id,
        team1Score,
        team2Score,
        createdAt: m.created_at,
      };
    });
    res.json({
      matches,
      playOrder: clubRaidService.computeClubRaidPlayOrder(
        rows.map((m) => ({
          id: m.id,
          sessionId: m.session_id,
          round: m.round,
          clubAId: m.club_a_id,
          clubBId: m.club_b_id,
          clubAPlayer1: m.club_a_player_1,
          clubAPlayer2: m.club_a_player_2,
          clubBPlayer1: m.club_b_player_1,
          clubBPlayer2: m.club_b_player_2,
          matchId: m.match_id,
          status: m.status as 'scheduled' | 'active' | 'completed',
          winnerClubId: m.winner_club_id,
          createdAt: m.created_at,
        })),
        session.court_count,
      ),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/club-raid/standings — Get club standings
 */
app.get('/api/sessions/:sessionId/club-raid/standings', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const standings = clubRaidService.getStandings(sessionId);
    res.json({ standings });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:sessionId/club-raid/schedule/:matchId/start — Start a club raid match
 * Body (optional): { courtNumber?: number } — the 1-based court to start on. When
 * omitted, the first available court is used (backwards-compatible behaviour).
 */
app.post('/api/sessions/:sessionId/club-raid/schedule/:matchId/start', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const clubRaidMatchId = req.params.matchId as string;
    const session = getSessionById(sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (session.status === 'ended') throw new ValidationError('Session has ended', ['sessionId']);

    const scheduleMatch = repo.getClubRaidMatchesBySession(sessionId).find(m => m.id === clubRaidMatchId);
    if (!scheduleMatch) throw new NotFoundError('Club raid match not found');
    if (scheduleMatch.status === 'active') throw new ValidationError('This match is already live', ['matchId']);
    if (scheduleMatch.status === 'completed') throw new ValidationError('This match is already completed', ['matchId']);

    // Use pre-assigned players from schedule generation
    const teamA = [scheduleMatch.club_a_player_1, scheduleMatch.club_a_player_2].filter(Boolean) as string[];
    const teamB = [scheduleMatch.club_b_player_1, scheduleMatch.club_b_player_2].filter(Boolean) as string[];

    if (teamA.length < 2 || teamB.length < 2) {
      throw new ValidationError('This match is missing player assignments. Regenerate the schedule.', ['matchId']);
    }

    // Determine which court to use.
    const courts = courtService.getCourts(sessionId);
    const requested = req.body?.courtNumber != null ? Number(req.body.courtNumber) : NaN;
    let courtNumber: number;
    if (!Number.isNaN(requested)) {
      if (requested < 1 || requested > session.court_count) {
        throw new ValidationError(`Court number must be between 1 and ${session.court_count}`, ['courtNumber']);
      }
      const target = courts.find(c => c.courtNumber === requested);
      if (target && target.status !== 'available') {
        throw new ValidationError(`Court ${requested} is not available`, ['courtNumber']);
      }
      courtNumber = requested;
    } else {
      const availableCourt = courts.find(c => c.status === 'available');
      if (!availableCourt) {
        throw new ValidationError('No courts available to start a match', ['courtNumber']);
      }
      courtNumber = availableCourt.courtNumber;
    }

    // Create the match using startMatchManual to bypass club_raid queue pairing
    const match = courtService.startMatchManual(sessionId, courtNumber, [...teamA, ...teamB]);

    // Link to club raid match
    repo.updateClubRaidMatch(clubRaidMatchId, {
      match_id: match.id,
      status: 'active',
    });

    res.status(201).json({ match, clubRaidMatchId, courtNumber });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Blog Routes
// ============================================================

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * GET /api/blog — List all blog posts
 */
app.get('/api/blog', (_req: Request, res: Response) => {
  const posts = blogService.getAllPosts();
  res.json(posts);
});

/**
 * GET /api/blog/:slug — Get single post with comments
 */
app.get('/api/blog/:slug', (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const post = blogService.getPostBySlug(slug);
  if (!post) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }
  const comments = blogService.getCommentsByPostId(post.id);
  res.json({ ...post, comments });
});

/**
 * POST /api/blog — Create a new post
 */
app.post('/api/blog', (req: Request, res: Response) => {
  const { title, content, excerpt, coverImage, author } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: 'Title and content are required' });
    return;
  }
  const post = blogService.createPost({ title, content, excerpt, coverImage, author });
  res.status(201).json(post);
});

/**
 * PUT /api/blog/:id — Update a post
 */
app.put('/api/blog/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const post = blogService.updatePost(id, req.body);
  if (!post) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }
  res.json(post);
});

/**
 * DELETE /api/blog/:id — Delete a post
 */
app.delete('/api/blog/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = blogService.deletePost(id);
  if (!deleted) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }
  res.status(204).end();
});

/**
 * POST /api/blog/:id/comments — Add a comment
 */
app.post('/api/blog/:id/comments', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { author, content } = req.body;
  if (!author || !content) {
    res.status(400).json({ error: 'Author and content are required' });
    return;
  }
  const comment = blogService.addComment(id, { author, content });
  if (!comment) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }
  res.status(201).json(comment);
});

/**
 * POST /api/blog/upload — Upload an image
 */
app.post('/api/blog/upload', upload.single('image'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file provided' });
    return;
  }
  const url = blogService.saveImage(req.file.originalname, req.file.buffer);
  res.status(201).json({ url });
});

/**
 * GET /api/blog/images/:filename — Serve blog images
 */
app.get('/api/blog/images/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename as string;
  const filePath = blogService.getImagePath(filename);
  if (!filePath) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }
  res.sendFile(filePath);
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

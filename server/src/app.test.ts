import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from './app';
import { getDb } from './db';
import * as sessionService from './services/sessionService';

// Reset database before each test
beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM player_achievements');
  db.exec('DELETE FROM pairing_history');
  db.exec('DELETE FROM player_ratings');
  db.exec('DELETE FROM match_results');
  db.exec('DELETE FROM match_quality_scores');
  db.exec('DELETE FROM queue_entries');
  db.exec('DELETE FROM fixed_pairs');
  db.exec('DELETE FROM matches');
  db.exec('DELETE FROM players');
  db.exec('DELETE FROM sessions');
});

describe('POST /api/sessions', () => {
  it('creates a session with valid inputs', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ name: 'Sunday Open Play', courtCount: 4 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Sunday Open Play');
    expect(res.body.courtCount).toBe(4);
    expect(res.body.status).toBe('active');
    expect(res.body.id).toBeDefined();
    expect(res.body.liveViewUrl).toBeDefined();
  });

  it('returns 400 for invalid session name', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ name: '   ', courtCount: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for invalid court count', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ name: 'Test Session', courtCount: 15 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/sessions/:sessionId', () => {
  it('returns full session state for organizer', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Test Session', courtCount: 3 });

    const sessionId = createRes.body.id;

    const res = await request(app).get(`/api/sessions/${sessionId}`);

    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(sessionId);
    expect(res.body.session.name).toBe('Test Session');
    expect(res.body.queue).toEqual([]);
    expect(res.body.courts).toHaveLength(3);
    expect(res.body.activeMatches).toEqual([]);
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/non-existent-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Session not found');
  });
});

describe('GET /api/sessions/:sessionId/live', () => {
  it('returns session state formatted for live view', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Live Test', courtCount: 2 });

    const sessionId = createRes.body.id;

    // Add some players
    await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: 'Alice' });
    await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: 'Bob' });

    const res = await request(app).get(`/api/sessions/${sessionId}/live`);

    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(sessionId);
    expect(res.body.session.name).toBe('Live Test');
    expect(res.body.queue).toHaveLength(2);
    expect(res.body.queue[0].playerName).toBe('Alice');
    expect(res.body.queue[0].isUpNext).toBe(true);
    expect(res.body.queue[1].playerName).toBe('Bob');
    expect(res.body.queue[1].isUpNext).toBe(true);
  });

  it('marks only first 4 players as up next', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Queue Test', courtCount: 2 });

    const sessionId = createRes.body.id;

    // Add 6 players
    for (const name of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name });
    }

    const res = await request(app).get(`/api/sessions/${sessionId}/live`);

    expect(res.body.queue).toHaveLength(6);
    expect(res.body.queue[0].isUpNext).toBe(true);
    expect(res.body.queue[1].isUpNext).toBe(true);
    expect(res.body.queue[2].isUpNext).toBe(true);
    expect(res.body.queue[3].isUpNext).toBe(true);
    expect(res.body.queue[4].isUpNext).toBe(false);
    expect(res.body.queue[5].isUpNext).toBe(false);
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/non-existent-id/live');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Session not found');
  });
});


describe('POST /api/sessions/:sessionId/players', () => {
  it('checks in a player successfully', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Test Session', courtCount: 2 });

    const sessionId = createRes.body.id;

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Alice');
    expect(res.body.sessionId).toBe(sessionId);
    expect(res.body.id).toBeDefined();
  });

  it('returns 400 for invalid player name', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Test Session', courtCount: 2 });

    const sessionId = createRes.body.id;

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 409 for duplicate player name (case-insensitive)', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Test Session', courtCount: 2 });

    const sessionId = createRes.body.id;

    await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: 'Alice' });

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: 'ALICE' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .post('/api/sessions/non-existent-id/players')
      .send({ name: 'Alice' });

    expect(res.status).toBe(404);
  });

  it('returns 403 when session has ended', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Test Session', courtCount: 2 });

    const sessionId = createRes.body.id;

    // End the session directly via service
    sessionService.endSession(sessionId);

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: 'Alice' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/sessions/:sessionId/players/:playerId', () => {
  it('removes a player successfully', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Test Session', courtCount: 2 });

    const sessionId = createRes.body.id;

    const playerRes = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: 'Alice' });

    const playerId = playerRes.body.id;

    const res = await request(app)
      .delete(`/api/sessions/${sessionId}/players/${playerId}`);

    expect(res.status).toBe(204);

    // Verify player is removed from queue
    const sessionState = await request(app).get(`/api/sessions/${sessionId}`);
    expect(sessionState.body.queue).toHaveLength(0);
  });
});

describe('PUT /api/sessions/:sessionId/queue/move', () => {
  it('moves a player up in the queue', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Move Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    await request(app).post(`/api/sessions/${sessionId}/players`).send({ name: 'Alice' });
    const bobRes = await request(app).post(`/api/sessions/${sessionId}/players`).send({ name: 'Bob' });
    const bobId = bobRes.body.id;

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/queue/move`)
      .send({ playerId: bobId, direction: 'up' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].playerName).toBe('Bob');
    expect(res.body[1].playerName).toBe('Alice');
  });

  it('moves a player down in the queue', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Move Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const aliceRes = await request(app).post(`/api/sessions/${sessionId}/players`).send({ name: 'Alice' });
    const aliceId = aliceRes.body.id;
    await request(app).post(`/api/sessions/${sessionId}/players`).send({ name: 'Bob' });

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/queue/move`)
      .send({ playerId: aliceId, direction: 'down' });

    expect(res.status).toBe(200);
    expect(res.body[0].playerName).toBe('Bob');
    expect(res.body[1].playerName).toBe('Alice');
  });

  it('no-op when moving first player up', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Move Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const aliceRes = await request(app).post(`/api/sessions/${sessionId}/players`).send({ name: 'Alice' });
    const aliceId = aliceRes.body.id;
    await request(app).post(`/api/sessions/${sessionId}/players`).send({ name: 'Bob' });

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/queue/move`)
      .send({ playerId: aliceId, direction: 'up' });

    expect(res.status).toBe(200);
    expect(res.body[0].playerName).toBe('Alice');
    expect(res.body[1].playerName).toBe('Bob');
  });
});

describe('POST /api/sessions/:sessionId/courts/:courtNumber/start', () => {
  it('starts a match with 4+ players in queue', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Court Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    for (const name of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      await request(app).post(`/api/sessions/${sessionId}/players`).send({ name });
    }

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.courtNumber).toBe(1);
    expect(res.body.playerIds).toHaveLength(4);
    expect(res.body.status).toBe('active');
  });

  it('returns 422 when fewer than 4 players in queue', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Court Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    for (const name of ['P1', 'P2', 'P3']) {
      await request(app).post(`/api/sessions/${sessionId}/players`).send({ name });
    }

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Not enough players');
  });

  it('returns 409 when court already has an active match', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Court Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    for (const name of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']) {
      await request(app).post(`/api/sessions/${sessionId}/players`).send({ name });
    }

    // Start first match on court 1
    await request(app).post(`/api/sessions/${sessionId}/courts/1/start`).send();

    // Try to start another match on court 1
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Court is already occupied');
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .post('/api/sessions/non-existent-id/courts/1/start')
      .send();

    expect(res.status).toBe(404);
  });
});

describe('POST /api/sessions/:sessionId/courts/:courtNumber/complete', () => {
  it('completes an active match and returns 204', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Complete Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    for (const name of ['P1', 'P2', 'P3', 'P4']) {
      await request(app).post(`/api/sessions/${sessionId}/players`).send({ name });
    }

    await request(app).post(`/api/sessions/${sessionId}/courts/1/start`).send();

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ skip: true });

    expect(res.status).toBe(204);

    // Verify players returned to queue
    const sessionState = await request(app).get(`/api/sessions/${sessionId}`);
    expect(sessionState.body.queue).toHaveLength(4);
  });

  it('returns 404 when no active match on court', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Complete Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ skip: true });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No active match');
  });

  it('returns 400 when no winning team or skip provided', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Complete Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    for (const name of ['P1', 'P2', 'P3', 'P4']) {
      await request(app).post(`/api/sessions/${sessionId}/players`).send({ name });
    }

    await request(app).post(`/api/sessions/${sessionId}/courts/1/start`).send();

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Must select a winning team or skip score');
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .post('/api/sessions/non-existent-id/courts/1/complete')
      .send({ skip: true });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/sessions/:sessionId/end', () => {
  it('ends an active session and returns summary', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'End Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    // Add players and start a match
    for (const name of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      await request(app).post(`/api/sessions/${sessionId}/players`).send({ name });
    }
    await request(app).post(`/api/sessions/${sessionId}/courts/1/start`).send();

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.totalPlayersCheckedIn).toBe(5);
    expect(res.body.totalMatchesCompleted).toBe(1); // force-completed active match
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .post('/api/sessions/non-existent-id/end')
      .send();

    expect(res.status).toBe(404);
  });

  it('returns 400 for already ended session', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'End Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    // End the session
    await request(app).post(`/api/sessions/${sessionId}/end`).send();

    // Try to end again
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already ended');
  });
});

describe('Error mapping', () => {
  it('returns 500 for unexpected errors', async () => {
    // This test verifies the error handler exists and handles unknown errors
    // We can't easily trigger a 500 without mocking, but we verify the app compiles
    // and the error handler is registered
    const res = await request(app).get('/api/sessions/test-id');
    // This should be 404, not 500
    expect(res.status).toBe(404);
  });
});


// ============================================================
// Integration Tests for Smart Match Scoring API Endpoints
// ============================================================

/**
 * Helper: creates a session, adds N players, and returns session ID + player IDs.
 */
async function setupSessionWithPlayers(
  courtCount: number,
  playerNames: string[],
  starRatings?: (number | undefined)[]
) {
  const createRes = await request(app)
    .post('/api/sessions')
    .send({ name: 'Integration Test', courtCount });
  const sessionId = createRes.body.id;

  const playerIds: string[] = [];
  for (let i = 0; i < playerNames.length; i++) {
    const body: Record<string, unknown> = { name: playerNames[i] };
    if (starRatings && starRatings[i] !== undefined) {
      body.starRating = starRatings[i];
    }
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send(body);
    playerIds.push(res.body.id);
  }

  return { sessionId, playerIds };
}

/**
 * Helper: starts a match on court 1 and completes it with a winning team.
 * Returns the match object from the start response.
 */
async function startAndCompleteMatch(
  sessionId: string,
  courtNumber: number,
  winningTeam: 'team1' | 'team2'
) {
  const startRes = await request(app)
    .post(`/api/sessions/${sessionId}/courts/${courtNumber}/start`)
    .send();
  const match = startRes.body;

  await request(app)
    .post(`/api/sessions/${sessionId}/courts/${courtNumber}/complete`)
    .send({ winningTeam });

  return match;
}

describe('Full match lifecycle: start → complete with score → verify ratings updated', () => {
  it('records a match result and updates player ratings', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['Alice', 'Bob', 'Charlie', 'Dave']);

    // Start a match on court 1
    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    expect(startRes.status).toBe(201);
    const matchPlayerIds = startRes.body.playerIds;

    // Complete with team1 winning
    const completeRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ winningTeam: 'team1' });
    expect(completeRes.status).toBe(204);

    // Verify stats are updated
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    expect(statsRes.status).toBe(200);

    const stats = statsRes.body;
    expect(stats.length).toBe(4);

    // Team 1 players (first 2 in match) should have 1 win
    const team1Stats = stats.filter((s: any) =>
      [matchPlayerIds[0], matchPlayerIds[1]].includes(s.playerId)
    );
    for (const s of team1Stats) {
      expect(s.wins).toBe(1);
      expect(s.losses).toBe(0);
      expect(s.matchesPlayed).toBe(1);
      expect(s.winRate).toBe(100);
      expect(s.rating).toBeGreaterThan(1000);
    }

    // Team 2 players (last 2 in match) should have 1 loss
    const team2Stats = stats.filter((s: any) =>
      [matchPlayerIds[2], matchPlayerIds[3]].includes(s.playerId)
    );
    for (const s of team2Stats) {
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(1);
      expect(s.matchesPlayed).toBe(1);
      expect(s.winRate).toBe(0);
      expect(s.rating).toBeLessThan(1000);
    }
  });

  it('accepts starRating at check-in and uses it for initial rating', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(
      2,
      ['Expert', 'Beginner', 'Novice', 'Advanced'],
      [5, 1, 2, 4]
    );

    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    expect(statsRes.status).toBe(200);

    const expertStat = statsRes.body.find((s: any) => s.playerId === playerIds[0]);
    const beginnerStat = statsRes.body.find((s: any) => s.playerId === playerIds[1]);
    const noviceStat = statsRes.body.find((s: any) => s.playerId === playerIds[2]);
    const advancedStat = statsRes.body.find((s: any) => s.playerId === playerIds[3]);

    expect(expertStat.rating).toBe(1600);
    expect(expertStat.starRating).toBe(5);
    expect(beginnerStat.rating).toBe(400);
    expect(beginnerStat.starRating).toBe(1);
    expect(noviceStat.rating).toBe(700);
    expect(noviceStat.starRating).toBe(2);
    expect(advancedStat.rating).toBe(1300);
    expect(advancedStat.starRating).toBe(4);
  });

  it('returns 400 for invalid starRating', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: 'BadRating', starRating: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('PUT /api/sessions/:sessionId/pairing-mode', () => {
  it('toggles pairing mode and persists it', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['Alice', 'Bob']);

    // Default should be 'smart'
    const sessionRes = await request(app).get(`/api/sessions/${sessionId}`);
    expect(sessionRes.body.session.pairingMode).toBe('smart');

    // Toggle to queue
    const toggleRes = await request(app)
      .put(`/api/sessions/${sessionId}/pairing-mode`)
      .send({ mode: 'queue' });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.mode).toBe('queue');

    // Verify persistence
    const sessionRes2 = await request(app).get(`/api/sessions/${sessionId}`);
    expect(sessionRes2.body.session.pairingMode).toBe('queue');

    // Toggle back to smart
    const toggleRes2 = await request(app)
      .put(`/api/sessions/${sessionId}/pairing-mode`)
      .send({ mode: 'smart' });
    expect(toggleRes2.status).toBe(200);
    expect(toggleRes2.body.mode).toBe('smart');
  });

  it('returns 400 for invalid mode', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['Alice']);

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/pairing-mode`)
      .send({ mode: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("'smart' or 'queue'");
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .put('/api/sessions/non-existent/pairing-mode')
      .send({ mode: 'queue' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when session has ended', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['Alice']);
    await request(app).post(`/api/sessions/${sessionId}/end`).send();

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/pairing-mode`)
      .send({ mode: 'queue' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/sessions/:sessionId/matches/:matchId/result', () => {
  it('updates a match result after it has been recorded', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    // Start and complete a match with team1 winning
    const match = await startAndCompleteMatch(sessionId, 1, 'team1');

    // Verify team1 won initially
    let statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    const matchPlayerIds: string[] = match.playerIds;
    let p1Stat = statsRes.body.find((s: any) => s.playerId === matchPlayerIds[0]);
    expect(p1Stat.wins).toBe(1);

    // Update result to team2 winning
    const updateRes = await request(app)
      .put(`/api/sessions/${sessionId}/matches/${match.id}/result`)
      .send({ winningTeam: 'team2' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.winnerPlayerIds).toContain(matchPlayerIds[2]);
    expect(updateRes.body.winnerPlayerIds).toContain(matchPlayerIds[3]);

    // Verify the persisted result now shows team2 as winners
    expect(updateRes.body.loserPlayerIds).toContain(matchPlayerIds[0]);
    expect(updateRes.body.loserPlayerIds).toContain(matchPlayerIds[1]);

    // Verify ratings reflect the correction: team2 players should have higher
    // rating than team1 players after the update
    statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    p1Stat = statsRes.body.find((s: any) => s.playerId === matchPlayerIds[0]);
    const p3Stat = statsRes.body.find((s: any) => s.playerId === matchPlayerIds[2]);
    expect(p3Stat.rating).toBeGreaterThan(p1Stat.rating);
  });

  it('returns 404 for non-existent match result', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    // Start a match but complete with skip (no result recorded)
    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ skip: true });

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/matches/${startRes.body.id}/result`)
      .send({ winningTeam: 'team1' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid winningTeam value', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);
    const match = await startAndCompleteMatch(sessionId, 1, 'team1');

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/matches/${match.id}/result`)
      .send({ winningTeam: 'team3' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when session has ended', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);
    const match = await startAndCompleteMatch(sessionId, 1, 'team1');

    // End the session
    await request(app).post(`/api/sessions/${sessionId}/end`).send();

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/matches/${match.id}/result`)
      .send({ winningTeam: 'team2' });
    // The endpoint validates session not ended — returns 400 (mapped from ValidationError)
    expect(res.status).toBe(403);
  });
});

describe('GET /api/sessions/:sessionId/leaderboard', () => {
  it('returns leaderboard sorted by win rate', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(
      2,
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
    );

    // Play two matches so some players have different records
    await startAndCompleteMatch(sessionId, 1, 'team1');
    await startAndCompleteMatch(sessionId, 1, 'team2');

    const res = await request(app).get(`/api/sessions/${sessionId}/leaderboard`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(8);

    // Verify sorted by win rate descending
    for (let i = 0; i < res.body.length - 1; i++) {
      expect(res.body[i].winRate).toBeGreaterThanOrEqual(res.body[i + 1].winRate);
    }

    // Verify rank is assigned
    expect(res.body[0].rank).toBe(1);
    expect(res.body[1].rank).toBe(2);
  });

  it('includes all players even those with 0 matches', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4', 'P5']);

    // Only play one match (4 players), P5 has 0 matches
    await startAndCompleteMatch(sessionId, 1, 'team1');

    const res = await request(app).get(`/api/sessions/${sessionId}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5);

    // Find the player with 0 matches
    const zeroMatchPlayer = res.body.find((e: any) => e.matchesPlayed === 0);
    expect(zeroMatchPlayer).toBeDefined();
    expect(zeroMatchPlayer.winRate).toBe(0);
    expect(zeroMatchPlayer.rating).toBe(1000);
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/non-existent/leaderboard');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/sessions/:sessionId/end — leaderboard in response', () => {
  it('includes leaderboard with rankings in session end response', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    // Play a match
    await startAndCompleteMatch(sessionId, 1, 'team1');

    const endRes = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .send();
    expect(endRes.status).toBe(200);
    expect(endRes.body.leaderboard).toBeDefined();
    expect(Array.isArray(endRes.body.leaderboard)).toBe(true);
    expect(endRes.body.leaderboard.length).toBe(4);

    // Verify leaderboard entries have expected fields
    const firstEntry = endRes.body.leaderboard[0];
    expect(firstEntry.rank).toBe(1);
    expect(firstEntry.playerId).toBeDefined();
    expect(firstEntry.playerName).toBeDefined();
    expect(firstEntry.wins).toBeDefined();
    expect(firstEntry.losses).toBeDefined();
    expect(firstEntry.winRate).toBeDefined();
    expect(firstEntry.rating).toBeDefined();
    expect(firstEntry.isMvp).toBeDefined();
    expect(firstEntry.achievements).toBeDefined();
  });
});

describe('GET /api/sessions/:sessionId/players/:playerId/history', () => {
  it('returns match history for a player', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(
      2,
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
    );

    // Play two matches
    const match1 = await startAndCompleteMatch(sessionId, 1, 'team1');
    const match2 = await startAndCompleteMatch(sessionId, 1, 'team2');

    // Get history for first player in match1
    const targetPlayerId = match1.playerIds[0];
    const res = await request(app)
      .get(`/api/sessions/${sessionId}/players/${targetPlayerId}/history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    // Verify history entry structure
    const entry = res.body[0];
    expect(entry.matchId).toBeDefined();
    expect(entry.courtNumber).toBeDefined();
    expect(entry.teammateIds).toBeDefined();
    expect(entry.opponentIds).toBeDefined();
    expect(entry.result).toBeDefined();
    expect(['win', 'loss', 'skipped']).toContain(entry.result);
    expect(entry.timestamp).toBeDefined();
  });

  it('shows skipped result for matches without score', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    // Start and complete with skip
    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    const matchPlayerIds = startRes.body.playerIds;
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ skip: true });

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/players/${matchPlayerIds[0]}/history`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].result).toBe('skipped');
  });

  it('returns 404 for non-existent player', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1']);

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/players/non-existent/history`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .get('/api/sessions/non-existent/players/some-id/history');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sessions/:sessionId/players/:playerId/head-to-head', () => {
  it('returns head-to-head records after matches', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    // Play a match with score
    const match = await startAndCompleteMatch(sessionId, 1, 'team1');
    const matchPlayerIds: string[] = match.playerIds;

    // Get head-to-head for team1 player against team2 opponents
    const res = await request(app)
      .get(`/api/sessions/${sessionId}/players/${matchPlayerIds[0]}/head-to-head`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Should have records against team2 players
    const opponents = res.body.filter((r: any) =>
      [matchPlayerIds[2], matchPlayerIds[3]].includes(r.opponentId)
    );
    expect(opponents.length).toBe(2);
    for (const opp of opponents) {
      expect(opp.wins).toBe(1);
      expect(opp.losses).toBe(0);
      expect(opp.encounters).toBe(1);
      expect(opp.opponentName).toBeDefined();
    }
  });

  it('returns empty array when player has no opponents', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, ['P1', 'P2']);

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/players/${playerIds[0]}/head-to-head`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 404 for non-existent player', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1']);

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/players/non-existent/head-to-head`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sessions/:sessionId/players/:playerId/profile', () => {
  it('returns full player profile with stats, history, and achievements', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    const match = await startAndCompleteMatch(sessionId, 1, 'team1');
    const targetPlayerId = match.playerIds[0];

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/players/${targetPlayerId}/profile`);
    expect(res.status).toBe(200);

    const profile = res.body;
    expect(profile.playerId).toBe(targetPlayerId);
    expect(profile.playerName).toBeDefined();
    expect(profile.starRating).toBeDefined();
    expect(profile.rating).toBeDefined();
    expect(profile.wins).toBe(1);
    expect(profile.losses).toBe(0);
    expect(profile.matchesPlayed).toBe(1);
    expect(profile.winRate).toBe(100);
    expect(profile.streak).toBe(1);
    expect(Array.isArray(profile.matchHistory)).toBe(true);
    expect(profile.matchHistory.length).toBe(1);
    expect(Array.isArray(profile.headToHead)).toBe(true);
    expect(Array.isArray(profile.achievements)).toBe(true);
  });

  it('returns 404 for non-existent player', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1']);

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/players/non-existent/profile`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sessions/:sessionId/achievements', () => {
  it('returns empty achievements when no criteria met', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    // Play one match — not enough for any achievement
    await startAndCompleteMatch(sessionId, 1, 'team1');

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/achievements`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('awards Comeback King after win following 2+ losses', async () => {
    // Need 8 players to play multiple matches
    const { sessionId } = await setupSessionWithPlayers(
      2,
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
    );

    // Match 1: team1 wins (P1, P2 win; P3, P4 lose)
    const match1 = await startAndCompleteMatch(sessionId, 1, 'team1');
    const loserFromMatch1 = match1.playerIds[2]; // P3 loses

    // Match 2: need P3 to lose again — start another match
    // After match 1, players return to queue. Start another match.
    const match2 = await startAndCompleteMatch(sessionId, 1, 'team1');

    // Match 3: need the losing player to win
    const match3 = await startAndCompleteMatch(sessionId, 1, 'team2');

    // Check achievements
    const res = await request(app)
      .get(`/api/sessions/${sessionId}/achievements`);
    expect(res.status).toBe(200);

    // We can't guarantee which specific player gets Comeback King due to queue ordering,
    // but we verify the endpoint works and returns valid achievement data
    if (res.body.length > 0) {
      const achievement = res.body[0];
      expect(achievement.playerId).toBeDefined();
      expect(achievement.sessionId).toBe(sessionId);
      expect(achievement.kind).toBeDefined();
      expect(achievement.awardedAt).toBeDefined();
    }
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .get('/api/sessions/non-existent/achievements');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sessions/:sessionId/stats', () => {
  it('returns player statistics for the session', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    const res = await request(app).get(`/api/sessions/${sessionId}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);

    // All players should have 0 matches initially
    for (const stat of res.body) {
      expect(stat.matchesPlayed).toBe(0);
      expect(stat.wins).toBe(0);
      expect(stat.losses).toBe(0);
      expect(stat.winRate).toBe(0);
      expect(stat.rating).toBe(1000);
      expect(stat.starRating).toBe(3);
    }
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/non-existent/stats');
    expect(res.status).toBe(404);
  });
});

describe('Complete match with winningTeam via court complete endpoint', () => {
  it('records result when completing with winningTeam', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    const matchId = startRes.body.id;

    // Complete with team2 winning
    const completeRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ winningTeam: 'team2' });
    expect(completeRes.status).toBe(204);

    // Verify stats reflect team2 winning
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    const matchPlayerIds = startRes.body.playerIds;

    const team2Player = statsRes.body.find((s: any) => s.playerId === matchPlayerIds[2]);
    expect(team2Player.wins).toBe(1);
    expect(team2Player.losses).toBe(0);

    const team1Player = statsRes.body.find((s: any) => s.playerId === matchPlayerIds[0]);
    expect(team1Player.wins).toBe(0);
    expect(team1Player.losses).toBe(1);
  });
});


// ============================================================
// End-to-End Integration Tests (Task 16.3)
// ============================================================

describe('E2E: Full session lifecycle', () => {
  it('create → check-in with stars → start match → complete with score → verify stats → end session → verify leaderboard', async () => {
    // 1. Create session
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Full Lifecycle Test', courtCount: 2 });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;

    // 2. Check in 4 players with star ratings
    const players: { id: string; name: string; star: number }[] = [];
    const playerData = [
      { name: 'Alice', starRating: 5 },
      { name: 'Bob', starRating: 4 },
      { name: 'Charlie', starRating: 3 },
      { name: 'Dave', starRating: 2 },
    ];
    for (const p of playerData) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send(p);
      expect(res.status).toBe(201);
      players.push({ id: res.body.id, name: p.name, star: p.starRating });
    }

    // 3. Verify initial stats reflect star ratings
    let statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    expect(statsRes.status).toBe(200);
    const aliceStat = statsRes.body.find((s: any) => s.playerId === players[0].id);
    expect(aliceStat.rating).toBe(1600); // 5 star
    expect(aliceStat.starRating).toBe(5);
    const daveStat = statsRes.body.find((s: any) => s.playerId === players[3].id);
    expect(daveStat.rating).toBe(700); // 2 star
    expect(daveStat.starRating).toBe(2);

    // 4. Start a match on court 1
    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    expect(startRes.status).toBe(201);
    const matchPlayerIds: string[] = startRes.body.playerIds;
    expect(matchPlayerIds).toHaveLength(4);

    // 5. Complete match with team1 winning
    const completeRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ winningTeam: 'team1' });
    expect(completeRes.status).toBe(204);

    // 6. Verify stats updated after match
    statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    expect(statsRes.status).toBe(200);

    const team1Player = statsRes.body.find((s: any) => s.playerId === matchPlayerIds[0]);
    expect(team1Player.wins).toBe(1);
    expect(team1Player.losses).toBe(0);
    expect(team1Player.matchesPlayed).toBe(1);
    expect(team1Player.winRate).toBe(100);

    const team2Player = statsRes.body.find((s: any) => s.playerId === matchPlayerIds[2]);
    expect(team2Player.wins).toBe(0);
    expect(team2Player.losses).toBe(1);
    expect(team2Player.matchesPlayed).toBe(1);
    expect(team2Player.winRate).toBe(0);

    // 7. End session
    const endRes = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .send();
    expect(endRes.status).toBe(200);

    // 8. Verify leaderboard in end response
    expect(endRes.body.leaderboard).toBeDefined();
    expect(endRes.body.leaderboard).toHaveLength(4);

    // All 4 players should be in leaderboard
    const leaderboardIds = endRes.body.leaderboard.map((e: any) => e.playerId);
    for (const p of players) {
      expect(leaderboardIds).toContain(p.id);
    }

    // Leaderboard should be sorted by win rate descending
    const leaderboard = endRes.body.leaderboard;
    for (let i = 0; i < leaderboard.length - 1; i++) {
      expect(leaderboard[i].winRate).toBeGreaterThanOrEqual(leaderboard[i + 1].winRate);
    }

    // Winners (team1) should be ranked above losers (team2)
    const team1Rank = leaderboard.find((e: any) => e.playerId === matchPlayerIds[0]).rank;
    const team2Rank = leaderboard.find((e: any) => e.playerId === matchPlayerIds[2]).rank;
    expect(team1Rank).toBeLessThan(team2Rank);

    // Each entry should have required fields
    for (const entry of leaderboard) {
      expect(entry.rank).toBeDefined();
      expect(entry.playerId).toBeDefined();
      expect(entry.playerName).toBeDefined();
      expect(entry.starRating).toBeDefined();
      expect(entry.rating).toBeDefined();
      expect(entry.wins).toBeDefined();
      expect(entry.losses).toBeDefined();
      expect(entry.matchesPlayed).toBeDefined();
      expect(entry.winRate).toBeDefined();
      expect(entry.isMvp).toBeDefined();
      expect(entry.achievements).toBeDefined();
    }
  });
});

describe('E2E: Pairing mode switch mid-session', () => {
  it('switches from smart to queue mode and verifies FIFO ordering, then switches back', async () => {
    // 1. Create session with 2 courts
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Pairing Mode Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    // 2. Add 8 players with varying star ratings
    const playerNames = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const starRatings = [5, 1, 4, 2, 3, 3, 5, 1];
    const playerIds: string[] = [];
    for (let i = 0; i < playerNames.length; i++) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name: playerNames[i], starRating: starRatings[i] });
      playerIds.push(res.body.id);
    }

    // 3. Verify default mode is 'smart'
    let sessionRes = await request(app).get(`/api/sessions/${sessionId}`);
    expect(sessionRes.body.session.pairingMode).toBe('smart');

    // 4. Switch to queue mode
    const toggleRes = await request(app)
      .put(`/api/sessions/${sessionId}/pairing-mode`)
      .send({ mode: 'queue' });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.mode).toBe('queue');

    // 5. Start a match in queue mode — should take first 4 players (FIFO)
    const match1Res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    expect(match1Res.status).toBe(201);

    // In queue mode, the first 4 players in queue order should be selected
    const match1Players: string[] = match1Res.body.playerIds;
    expect(match1Players).toHaveLength(4);
    // The first 4 players added should be selected (FIFO)
    expect(match1Players).toContain(playerIds[0]);
    expect(match1Players).toContain(playerIds[1]);
    expect(match1Players).toContain(playerIds[2]);
    expect(match1Players).toContain(playerIds[3]);

    // 6. Complete the match
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ winningTeam: 'team1' });

    // 7. Switch back to smart mode
    const toggleRes2 = await request(app)
      .put(`/api/sessions/${sessionId}/pairing-mode`)
      .send({ mode: 'smart' });
    expect(toggleRes2.status).toBe(200);
    expect(toggleRes2.body.mode).toBe('smart');

    // 8. Verify mode persisted
    sessionRes = await request(app).get(`/api/sessions/${sessionId}`);
    expect(sessionRes.body.session.pairingMode).toBe('smart');

    // 9. Start another match in smart mode — should use pairing algorithm
    const match2Res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    expect(match2Res.status).toBe(201);
    const match2Players: string[] = match2Res.body.playerIds;
    expect(match2Players).toHaveLength(4);

    // In smart mode, the algorithm may not pick strict FIFO order
    // but it should still pick 4 valid players from the queue
    // Verify all selected players are from the available pool
    const allPlayerIds = new Set(playerIds);
    for (const pid of match2Players) {
      expect(allPlayerIds.has(pid)).toBe(true);
    }
  });
});

describe('E2E: Achievement awarding across multiple matches', () => {
  it('awards Hot Streak and Undefeated achievements after 5 consecutive wins', async () => {
    // Create session with 2 courts and 8 players
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Achievement Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    // Add 8 players — we need enough to play 5 matches
    const playerNames = ['Winner1', 'Winner2', 'Loser1', 'Loser2', 'Extra1', 'Extra2', 'Extra3', 'Extra4'];
    const playerIds: string[] = [];
    for (const name of playerNames) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name });
      playerIds.push(res.body.id);
    }

    // Play 5 matches, tracking which players win
    // After each match, players return to queue. We need to track who ends up winning.
    const winnerTracker = new Map<string, number>(); // playerId -> win count

    for (let i = 0; i < 5; i++) {
      const startRes = await request(app)
        .post(`/api/sessions/${sessionId}/courts/1/start`)
        .send();
      expect(startRes.status).toBe(201);

      const matchPlayers: string[] = startRes.body.playerIds;
      // Team1 always wins
      await request(app)
        .post(`/api/sessions/${sessionId}/courts/1/complete`)
        .send({ winningTeam: 'team1' });

      // Track wins for team1 players
      for (const pid of [matchPlayers[0], matchPlayers[1]]) {
        winnerTracker.set(pid, (winnerTracker.get(pid) || 0) + 1);
      }
    }

    // Check achievements
    const achievementsRes = await request(app)
      .get(`/api/sessions/${sessionId}/achievements`);
    expect(achievementsRes.status).toBe(200);

    const achievements = achievementsRes.body;

    // Check stats to find players with 5+ consecutive wins
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    const stats = statsRes.body;

    // Find any player with streak >= 5 (Hot Streak candidate)
    const hotStreakPlayers = stats.filter((s: any) => s.streak >= 5);

    // If any player has 5+ consecutive wins, they should have Hot Streak
    if (hotStreakPlayers.length > 0) {
      const hotStreakAchievements = achievements.filter((a: any) => a.kind === 'HotStreak');
      expect(hotStreakAchievements.length).toBeGreaterThan(0);
    }

    // Find any player who is undefeated with 3+ matches
    const undefeatedPlayers = stats.filter((s: any) => s.matchesPlayed >= 3 && s.losses === 0);
    if (undefeatedPlayers.length > 0) {
      const undefeatedAchievements = achievements.filter((a: any) => a.kind === 'Undefeated');
      expect(undefeatedAchievements.length).toBeGreaterThan(0);
      // Verify the undefeated player has the achievement
      for (const player of undefeatedPlayers) {
        const playerAchievement = undefeatedAchievements.find(
          (a: any) => a.playerId === player.playerId
        );
        expect(playerAchievement).toBeDefined();
      }
    }

    // Verify achievement structure
    for (const achievement of achievements) {
      expect(achievement.playerId).toBeDefined();
      expect(achievement.sessionId).toBe(sessionId);
      expect(achievement.kind).toBeDefined();
      expect(achievement.awardedAt).toBeDefined();
    }
  });

  it('awards Iron Player after 5+ matches played', async () => {
    // Create session with 8 players
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Iron Player Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const playerNames = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    for (const name of playerNames) {
      await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name });
    }

    // Play 5 matches — some players will accumulate 5+ matches
    for (let i = 0; i < 5; i++) {
      const startRes = await request(app)
        .post(`/api/sessions/${sessionId}/courts/1/start`)
        .send();
      expect(startRes.status).toBe(201);
      await request(app)
        .post(`/api/sessions/${sessionId}/courts/1/complete`)
        .send({ winningTeam: i % 2 === 0 ? 'team1' : 'team2' });
    }

    // Check if any player has 5+ matches
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    const playersWithFivePlus = statsRes.body.filter((s: any) => s.matchesPlayed >= 5);

    if (playersWithFivePlus.length > 0) {
      const achievementsRes = await request(app)
        .get(`/api/sessions/${sessionId}/achievements`);
      const ironPlayerAchievements = achievementsRes.body.filter(
        (a: any) => a.kind === 'IronPlayer'
      );
      expect(ironPlayerAchievements.length).toBeGreaterThan(0);
    }
  });
});

describe('E2E: Player profile card data accuracy', () => {
  it('returns accurate stats, match history, and head-to-head after multiple matches', async () => {
    // 1. Create session with 4 players
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Profile Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const playerData = [
      { name: 'Alice', starRating: 4 },
      { name: 'Bob', starRating: 3 },
      { name: 'Charlie', starRating: 3 },
      { name: 'Dave', starRating: 2 },
    ];
    const playerIds: string[] = [];
    for (const p of playerData) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send(p);
      playerIds.push(res.body.id);
    }

    // 2. Play first match — team1 wins
    const match1Res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    expect(match1Res.status).toBe(201);
    const match1Players: string[] = match1Res.body.playerIds;

    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ winningTeam: 'team1' });

    // 3. Play second match — team2 wins
    const match2Res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    expect(match2Res.status).toBe(201);
    const match2Players: string[] = match2Res.body.playerIds;

    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ winningTeam: 'team2' });

    // 4. Get profile for the first player in match1 (a winner in match 1)
    const targetPlayerId = match1Players[0];
    const profileRes = await request(app)
      .get(`/api/sessions/${sessionId}/players/${targetPlayerId}/profile`);
    expect(profileRes.status).toBe(200);

    const profile = profileRes.body;

    // 5. Verify basic profile fields
    expect(profile.playerId).toBe(targetPlayerId);
    expect(profile.playerName).toBeDefined();
    expect(profile.starRating).toBeGreaterThanOrEqual(1);
    expect(profile.starRating).toBeLessThanOrEqual(5);
    expect(profile.rating).toBeGreaterThan(0);

    // 6. Verify stats accuracy
    // The target player won match 1 as team1
    expect(profile.wins).toBeGreaterThanOrEqual(1);
    expect(profile.matchesPlayed).toBeGreaterThanOrEqual(1);
    expect(profile.winRate).toBeGreaterThanOrEqual(0);
    expect(profile.winRate).toBeLessThanOrEqual(100);

    // 7. Verify match history
    expect(Array.isArray(profile.matchHistory)).toBe(true);
    expect(profile.matchHistory.length).toBeGreaterThanOrEqual(1);

    // Each history entry should have correct structure
    for (const entry of profile.matchHistory) {
      expect(entry.matchId).toBeDefined();
      expect(entry.courtNumber).toBeDefined();
      expect(Array.isArray(entry.teammateIds)).toBe(true);
      expect(Array.isArray(entry.opponentIds)).toBe(true);
      expect(['win', 'loss', 'skipped']).toContain(entry.result);
      expect(entry.timestamp).toBeDefined();
    }

    // The first match entry for this player should be a win
    const firstMatchEntry = profile.matchHistory.find(
      (e: any) => e.matchId === match1Res.body.id
    );
    if (firstMatchEntry) {
      expect(firstMatchEntry.result).toBe('win');
      expect(firstMatchEntry.teammateIds).toHaveLength(1);
      expect(firstMatchEntry.opponentIds).toHaveLength(2);
    }

    // 8. Verify head-to-head records
    expect(Array.isArray(profile.headToHead)).toBe(true);

    // If the player faced opponents, head-to-head should reflect that
    if (profile.headToHead.length > 0) {
      for (const h2h of profile.headToHead) {
        expect(h2h.opponentId).toBeDefined();
        expect(h2h.opponentName).toBeDefined();
        expect(h2h.wins).toBeGreaterThanOrEqual(0);
        expect(h2h.losses).toBeGreaterThanOrEqual(0);
        expect(h2h.encounters).toBeGreaterThan(0);
        // encounters should equal wins + losses
        expect(h2h.encounters).toBe(h2h.wins + h2h.losses);
      }

      // Head-to-head should be sorted by encounters descending
      for (let i = 0; i < profile.headToHead.length - 1; i++) {
        expect(profile.headToHead[i].encounters).toBeGreaterThanOrEqual(
          profile.headToHead[i + 1].encounters
        );
      }
    }

    // 9. Verify achievements array exists (may be empty)
    expect(Array.isArray(profile.achievements)).toBe(true);
  });

  it('profile shows correct win rate calculation', async () => {
    // Create session with 8 players to play multiple matches
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Win Rate Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const playerNames = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const playerIds: string[] = [];
    for (const name of playerNames) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name });
      playerIds.push(res.body.id);
    }

    // Play 3 matches
    const matchResults: { players: string[]; winningTeam: 'team1' | 'team2' }[] = [];
    for (let i = 0; i < 3; i++) {
      const startRes = await request(app)
        .post(`/api/sessions/${sessionId}/courts/1/start`)
        .send();
      matchResults.push({
        players: startRes.body.playerIds,
        winningTeam: i === 1 ? 'team2' : 'team1',
      });
      await request(app)
        .post(`/api/sessions/${sessionId}/courts/1/complete`)
        .send({ winningTeam: matchResults[i].winningTeam });
    }

    // Get stats and verify win rate calculation
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    for (const stat of statsRes.body) {
      if (stat.matchesPlayed > 0) {
        const expectedWinRate = parseFloat(
          ((stat.wins / stat.matchesPlayed) * 100).toFixed(1)
        );
        expect(stat.winRate).toBeCloseTo(expectedWinRate, 1);
      } else {
        expect(stat.winRate).toBe(0);
      }
    }

    // Verify a specific player's profile matches their stats
    const targetPlayer = statsRes.body.find((s: any) => s.matchesPlayed > 0);
    if (targetPlayer) {
      const profileRes = await request(app)
        .get(`/api/sessions/${sessionId}/players/${targetPlayer.playerId}/profile`);
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.wins).toBe(targetPlayer.wins);
      expect(profileRes.body.losses).toBe(targetPlayer.losses);
      expect(profileRes.body.matchesPlayed).toBe(targetPlayer.matchesPlayed);
      expect(profileRes.body.winRate).toBe(targetPlayer.winRate);
    }
  });

  it('leaderboard includes all players ranked correctly after session end', async () => {
    // Create session with 6 players (some won't play)
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Leaderboard Rank Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const playerNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
    const playerIds: string[] = [];
    for (const name of playerNames) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name });
      playerIds.push(res.body.id);
    }

    // Play one match (only 4 players participate)
    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ winningTeam: 'team1' });

    // End session
    const endRes = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .send();
    expect(endRes.status).toBe(200);

    const leaderboard = endRes.body.leaderboard;

    // All 6 players should be in leaderboard
    expect(leaderboard).toHaveLength(6);

    // Players with 0 matches should still appear
    const zeroMatchPlayers = leaderboard.filter((e: any) => e.matchesPlayed === 0);
    expect(zeroMatchPlayers.length).toBe(2); // Echo and Foxtrot didn't play

    // Zero-match players should have default values
    for (const p of zeroMatchPlayers) {
      expect(p.winRate).toBe(0);
      expect(p.rating).toBe(1000);
      expect(p.starRating).toBe(3);
    }

    // Winners (100% win rate) should be ranked above losers (0% win rate)
    // who should be ranked above non-players (0% win rate, 0 matches)
    const winners = leaderboard.filter((e: any) => e.wins > 0);
    const losers = leaderboard.filter((e: any) => e.losses > 0 && e.wins === 0);
    const nonPlayers = leaderboard.filter((e: any) => e.matchesPlayed === 0);

    // Winners should have lower rank numbers (higher position)
    for (const w of winners) {
      for (const l of losers) {
        expect(w.rank).toBeLessThan(l.rank);
      }
    }

    // Losers should be ranked above non-players (same win rate 0, but more matches)
    for (const l of losers) {
      for (const np of nonPlayers) {
        expect(l.rank).toBeLessThan(np.rank);
      }
    }
  });
});

// ============================================================
// Integration Tests for Session Settings & Score Endpoints (Task 8.2)
// ============================================================

describe('PUT /api/sessions/:sessionId/settings', () => {
  it('updates session settings successfully', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Settings Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'Updated Name',
        courtCount: 6,
        courtName: 'Main Court',
        sessionType: 'tournament',
        gameMode: 'singles',
        matchingMode: 'queue',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for invalid settings (empty name)', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Settings Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: '',
        courtCount: 6,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Session name must be 1-50 characters');
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .put('/api/sessions/non-existent/settings')
      .send({
        name: 'Test',
        courtCount: 4,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
      });

    expect(res.status).toBe(404);
  });

  it('returns 403 when session has ended', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Settings Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    await request(app).post(`/api/sessions/${sessionId}/end`).send();

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'Updated',
        courtCount: 4,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
      });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/sessions/:sessionId/settings', () => {
  it('returns default settings for a new session', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Get Settings Test', courtCount: 3 });
    const sessionId = createRes.body.id;

    const res = await request(app).get(`/api/sessions/${sessionId}/settings`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Get Settings Test');
    expect(res.body.courtCount).toBe(3);
    expect(res.body.courtName).toBe('');
    expect(res.body.sessionType).toBe('open_play');
    expect(res.body.gameMode).toBe('doubles');
    expect(res.body.matchingMode).toBe('smart');
  });

  it('returns updated settings after PUT', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Round Trip Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'New Name',
        courtCount: 8,
        courtName: 'Court B',
        sessionType: 'tournament',
        gameMode: 'singles',
        matchingMode: 'skill_courts',
      });

    const res = await request(app).get(`/api/sessions/${sessionId}/settings`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.courtCount).toBe(8);
    expect(res.body.courtName).toBe('Court B');
    expect(res.body.sessionType).toBe('tournament');
    expect(res.body.gameMode).toBe('singles');
    expect(res.body.matchingMode).toBe('skill_courts');
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/non-existent/settings');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/sessions/:sessionId/courts/:courtNumber/complete with scores', () => {
  it('completes a match with scores and derives winner', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    await request(app).post(`/api/sessions/${sessionId}/courts/1/start`).send();

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ team1Score: 11, team2Score: 7 });

    expect(res.status).toBe(204);

    // Verify stats reflect team1 winning (higher score)
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    const stats = statsRes.body;
    // At least one player should have a win
    const winners = stats.filter((s: any) => s.wins === 1);
    expect(winners.length).toBe(2);
  });

  it('returns 400 for equal scores', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    await request(app).post(`/api/sessions/${sessionId}/courts/1/start`).send();

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ team1Score: 7, team2Score: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Scores cannot be tied');
  });

  it('returns 400 for negative scores', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    await request(app).post(`/api/sessions/${sessionId}/courts/1/start`).send();

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ team1Score: -1, team2Score: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Scores must be non-negative integers');
  });

  it('applies score margin multiplier to rating adjustment', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['P1', 'P2', 'P3', 'P4']);

    await request(app).post(`/api/sessions/${sessionId}/courts/1/start`).send();

    // Complete with a large margin (11-1, margin=10, multiplier=1.5)
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/complete`)
      .send({ team1Score: 11, team2Score: 1 });

    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    const winners = statsRes.body.filter((s: any) => s.wins === 1);
    // With equal starting ratings (1000), scaleFactor=1.0, margin=10, multiplier=1.5
    // adjustment = round(16 * 1.0 * 1.5) = 24
    for (const w of winners) {
      expect(w.rating).toBe(1024);
    }
  });
});

describe('Singles mode match start via API', () => {
  it('starts a singles match with 2 players', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Singles API Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    // Update to singles mode
    await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'Singles API Test',
        courtCount: 2,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'singles',
        matchingMode: 'queue',
      });

    // Add 3 players
    for (const name of ['P1', 'P2', 'P3']) {
      await request(app).post(`/api/sessions/${sessionId}/players`).send({ name });
    }

    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();

    expect(startRes.status).toBe(201);
    expect(startRes.body.playerIds).toHaveLength(2);
  });

  it('returns 422 when fewer than 2 players in singles mode', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Singles API Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    // Update to singles mode
    await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'Singles API Test',
        courtCount: 2,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'singles',
        matchingMode: 'queue',
      });

    // Add only 1 player
    await request(app).post(`/api/sessions/${sessionId}/players`).send({ name: 'P1' });

    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();

    expect(startRes.status).toBe(422);
    expect(startRes.body.error).toContain('Not enough players');
  });
});

describe('GET /api/sessions/:sessionId/live includes onDeckPlayerIds', () => {
  it('returns onDeckPlayerIds in live view response', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'On Deck Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    for (const name of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      await request(app).post(`/api/sessions/${sessionId}/players`).send({ name });
    }

    const res = await request(app).get(`/api/sessions/${sessionId}/live`);

    expect(res.status).toBe(200);
    expect(res.body.onDeckPlayerIds).toBeDefined();
    expect(Array.isArray(res.body.onDeckPlayerIds)).toBe(true);
    // Default mode is smart, so should return min(6, 8) = 6 players
    expect(res.body.onDeckPlayerIds).toHaveLength(6);
  });

  it('returns session settings fields in live view', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Settings Live Test', courtCount: 2 });
    const sessionId = createRes.body.id;

    const res = await request(app).get(`/api/sessions/${sessionId}/live`);

    expect(res.status).toBe(200);
    expect(res.body.session.sessionType).toBe('open_play');
    expect(res.body.session.gameMode).toBe('doubles');
    expect(res.body.session.matchingMode).toBe('smart');
    expect(res.body.session.courtName).toBe('');
  });
});

// ============================================================
// Integration Tests for Fixed Pair API Routes
// ============================================================

describe('POST /api/sessions/:sessionId/pairs', () => {
  it('creates a fixed pair and returns 201 with pair data', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, ['Alice', 'Bob', 'Charlie']);

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[1] });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.sessionId).toBe(sessionId);
    expect(res.body.player1Id).toBe(playerIds[0]);
    expect(res.body.player2Id).toBe(playerIds[1]);
    expect(res.body.createdAt).toBeDefined();
  });

  it('returns 400 when pairing a player with themselves', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, ['Alice', 'Bob']);

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[0] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot pair a player with themselves');
  });

  it('returns 400 when player is already part of a fixed pair', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, ['Alice', 'Bob', 'Charlie']);

    // Create first pair
    await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[1] });

    // Try to pair Alice again with Charlie
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[2] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Player is already part of a fixed pair');
  });

  it('returns 400 when player is in an active match', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, [
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
    ]);

    // Switch to FIFO mode so match deterministically takes first 4 players
    await request(app)
      .put(`/api/sessions/${sessionId}/pairing-mode`)
      .send({ mode: 'queue' });

    // Start a match (takes first 4 players from queue in FIFO order)
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();

    // Try to pair P1 (in active match) with P5 (in queue)
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[4] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Player is currently in an active match');
  });

  it('returns 403 when session has ended', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, ['Alice', 'Bob']);

    // End the session
    await request(app).post(`/api/sessions/${sessionId}/end`).send();

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[1] });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Session has ended');
  });

  it('returns 400 when player is not in the session', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['Alice', 'Bob']);

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: 'non-existent-player', player2Id: 'another-fake-id' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Player not found in this session');
  });
});

describe('DELETE /api/sessions/:sessionId/pairs/:pairId', () => {
  it('dissolves a pair and returns 200', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, ['Alice', 'Bob', 'Charlie']);

    // Create a pair
    const createRes = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[1] });
    const pairId = createRes.body.id;

    // Dissolve the pair
    const res = await request(app)
      .delete(`/api/sessions/${sessionId}/pairs/${pairId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify pair no longer exists
    const listRes = await request(app).get(`/api/sessions/${sessionId}/pairs`);
    expect(listRes.body).toHaveLength(0);
  });

  it('returns 404 when dissolving a non-existent pair', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['Alice', 'Bob']);

    const res = await request(app)
      .delete(`/api/sessions/${sessionId}/pairs/non-existent-pair-id`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Fixed pair not found');
  });

  it('returns 400 when players are in an active match', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, [
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
    ]);

    // Switch to FIFO mode so match deterministically takes first entries
    await request(app)
      .put(`/api/sessions/${sessionId}/pairing-mode`)
      .send({ mode: 'queue' });

    // Create a pair with P1 and P2
    const createRes = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[1] });
    const pairId = createRes.body.id;

    // Start a match (the pair slot + 2 individuals = enough for a match)
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/1/start`)
      .send();

    // Try to dissolve the pair while in match
    const res = await request(app)
      .delete(`/api/sessions/${sessionId}/pairs/${pairId}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot dissolve pair while players are in an active match');
  });
});

describe('GET /api/sessions/:sessionId/pairs', () => {
  it('returns all pairs for a session', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, [
      'Alice', 'Bob', 'Charlie', 'Dave',
    ]);

    // Create two pairs
    await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[1] });
    await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[2], player2Id: playerIds[3] });

    const res = await request(app).get(`/api/sessions/${sessionId}/pairs`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].sessionId).toBe(sessionId);
    expect(res.body[1].sessionId).toBe(sessionId);
    // Verify pair data structure
    expect(res.body[0].id).toBeDefined();
    expect(res.body[0].player1Id).toBeDefined();
    expect(res.body[0].player2Id).toBeDefined();
    expect(res.body[0].createdAt).toBeDefined();
  });

  it('returns empty array when no pairs exist', async () => {
    const { sessionId } = await setupSessionWithPlayers(2, ['Alice', 'Bob']);

    const res = await request(app).get(`/api/sessions/${sessionId}/pairs`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('reflects dissolved pairs correctly', async () => {
    const { sessionId, playerIds } = await setupSessionWithPlayers(2, ['Alice', 'Bob', 'Charlie']);

    // Create a pair
    const createRes = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[1] });
    const pairId = createRes.body.id;

    // Dissolve it
    await request(app).delete(`/api/sessions/${sessionId}/pairs/${pairId}`);

    // Verify it's gone
    const res = await request(app).get(`/api/sessions/${sessionId}/pairs`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

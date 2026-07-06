import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getDb } from '../db';

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

interface ScenarioConfig {
  players: number;
  courts: number;
  pairs: number;
  matches: number;
}

async function runScenario(config: ScenarioConfig) {
  const { players, courts, pairs, matches } = config;

  // Create session
  const createRes = await request(app)
    .post('/api/sessions')
    .send({ name: `Test ${players}p ${courts}c`, courtCount: courts });
  const sessionId = createRes.body.id;

  await request(app)
    .put(`/api/sessions/${sessionId}/settings`)
    .send({
      name: `Test ${players}p ${courts}c`,
      courtCount: courts,
      courtName: '',
      sessionType: 'open_play',
      gameMode: 'doubles',
      matchingMode: 'smart',
      sessionDurationHours: 4,
    });

  // Add players
  const playerIds: string[] = [];
  for (let i = 1; i <= players; i++) {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: `P${i}`, starRating: ((i % 5) + 1) });
    playerIds.push(res.body.id);
  }

  // Create pairs
  const pairPlayerIds: string[] = [];
  for (let p = 0; p < pairs; p++) {
    await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[p * 2], player2Id: playerIds[p * 2 + 1] });
    pairPlayerIds.push(playerIds[p * 2], playerIds[p * 2 + 1]);
  }

  // Run matches
  let completedMatches = 0;
  for (let i = 0; i < matches; i++) {
    const courtNumber = (i % courts) + 1;
    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/${courtNumber}/start`)
      .send();
    if (startRes.status !== 201) continue;
    completedMatches++;

    const winningTeam = i % 2 === 0 ? 'team1' : 'team2';
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/${courtNumber}/complete`)
      .send({ winningTeam });
  }

  // Get stats
  const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
  const stats: Array<{ playerId: string; playerName: string; matchesPlayed: number }> = statsRes.body;

  const matchCounts = stats.map(s => s.matchesPlayed).filter(m => m > 0);
  const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
  const maxMatches = Math.max(...matchCounts);
  const minMatches = Math.min(...matchCounts);
  const deviation = maxMatches - minMatches;

  const individualStats = stats.filter(s => !pairPlayerIds.includes(s.playerId));
  const pairStats = stats.filter(s => pairPlayerIds.includes(s.playerId));
  const individualAvg = individualStats.length > 0
    ? individualStats.reduce((sum, s) => sum + s.matchesPlayed, 0) / individualStats.length
    : 0;
  const pairAvg = pairStats.length > 0
    ? pairStats.reduce((sum, s) => sum + s.matchesPlayed, 0) / pairStats.length
    : 0;

  // H2H for first paired player
  let maxH2H = 0;
  const profileRes = await request(app).get(`/api/sessions/${sessionId}/players/${playerIds[0]}/profile`);
  if (profileRes.status === 200) {
    const headToHead: Array<{ encounters: number }> = profileRes.body.headToHead ?? [];
    maxH2H = headToHead.length > 0 ? Math.max(...headToHead.map(h => h.encounters)) : 0;
  }

  return { completedMatches, avgMatches, minMatches, maxMatches, deviation, individualAvg, pairAvg, maxH2H };
}

describe('Fairness scenarios: varying player/court ratios', () => {
  it('50 players, 5 courts, 5 pairs, 90 matches', { timeout: 60000 }, async () => {
    const r = await runScenario({ players: 50, courts: 5, pairs: 5, matches: 90 });
    console.log('\n=== 50 players, 5 courts, 5 pairs, 90 matches ===');
    console.log(`Completed: ${r.completedMatches} | Avg: ${r.avgMatches.toFixed(1)} | Min: ${r.minMatches} | Max: ${r.maxMatches} | Dev: ${r.deviation}`);
    console.log(`Individual avg: ${r.individualAvg.toFixed(1)} | Pair avg: ${r.pairAvg.toFixed(1)} | Max H2H: ${r.maxH2H}`);
    expect(r.deviation).toBeLessThanOrEqual(4);
    expect(r.minMatches).toBeGreaterThanOrEqual(5);
  });

  it('40 players, 4 courts, 4 pairs, 80 matches', { timeout: 60000 }, async () => {
    const r = await runScenario({ players: 40, courts: 4, pairs: 4, matches: 80 });
    console.log('\n=== 40 players, 4 courts, 4 pairs, 80 matches ===');
    console.log(`Completed: ${r.completedMatches} | Avg: ${r.avgMatches.toFixed(1)} | Min: ${r.minMatches} | Max: ${r.maxMatches} | Dev: ${r.deviation}`);
    console.log(`Individual avg: ${r.individualAvg.toFixed(1)} | Pair avg: ${r.pairAvg.toFixed(1)} | Max H2H: ${r.maxH2H}`);
    expect(r.deviation).toBeLessThanOrEqual(4);
    expect(r.minMatches).toBeGreaterThanOrEqual(5);
  });

  it('30 players, 3 courts, 3 pairs, 60 matches', { timeout: 60000 }, async () => {
    const r = await runScenario({ players: 30, courts: 3, pairs: 3, matches: 60 });
    console.log('\n=== 30 players, 3 courts, 3 pairs, 60 matches ===');
    console.log(`Completed: ${r.completedMatches} | Avg: ${r.avgMatches.toFixed(1)} | Min: ${r.minMatches} | Max: ${r.maxMatches} | Dev: ${r.deviation}`);
    console.log(`Individual avg: ${r.individualAvg.toFixed(1)} | Pair avg: ${r.pairAvg.toFixed(1)} | Max H2H: ${r.maxH2H}`);
    expect(r.deviation).toBeLessThanOrEqual(4);
    expect(r.minMatches).toBeGreaterThanOrEqual(5);
  });

  it('20 players, 2 courts, 2 pairs, 50 matches', { timeout: 60000 }, async () => {
    const r = await runScenario({ players: 20, courts: 2, pairs: 2, matches: 50 });
    console.log('\n=== 20 players, 2 courts, 2 pairs, 50 matches ===');
    console.log(`Completed: ${r.completedMatches} | Avg: ${r.avgMatches.toFixed(1)} | Min: ${r.minMatches} | Max: ${r.maxMatches} | Dev: ${r.deviation}`);
    console.log(`Individual avg: ${r.individualAvg.toFixed(1)} | Pair avg: ${r.pairAvg.toFixed(1)} | Max H2H: ${r.maxH2H}`);
    expect(r.deviation).toBeLessThanOrEqual(4);
    expect(r.minMatches).toBeGreaterThanOrEqual(7);
  });
});

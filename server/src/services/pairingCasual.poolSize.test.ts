import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getDb } from '../db';
import { setCasualPoolSize } from './courtService';

function cleanDb() {
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
}

async function runTest(playerCount = 50, matchCount = 100, pairCount = 5) {
  const createRes = await request(app)
    .post('/api/sessions')
    .send({ name: 'Pool Test', courtCount: 5 });
  const sessionId = createRes.body.id;

  await request(app)
    .put(`/api/sessions/${sessionId}/settings`)
    .send({
      name: 'Pool Test',
      courtCount: 5,
      courtName: '',
      sessionType: 'open_play',
      gameMode: 'doubles',
      matchingMode: 'casual',
      sessionDurationHours: 4,
    });

  // Add players
  const playerIds: string[] = [];
  for (let i = 1; i <= playerCount; i++) {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/players`)
      .send({ name: `P${i}`, starRating: ((i % 5) + 1) });
    playerIds.push(res.body.id);
  }

  // Create pairs
  for (let p = 0; p < pairCount; p++) {
    await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[p * 2], player2Id: playerIds[p * 2 + 1] });
  }

  // Run matches
  let completedMatches = 0;
  for (let i = 0; i < matchCount; i++) {
    const courtNumber = (i % 5) + 1;
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

  // Gather stats
  const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
  const stats: Array<{ playerId: string; playerName: string; matchesPlayed: number }> = statsRes.body;

  const matchCounts = stats.map(s => s.matchesPlayed).filter(m => m > 0);
  const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
  const maxMatches = Math.max(...matchCounts);
  const minMatches = Math.min(...matchCounts);
  const deviation = maxMatches - minMatches;
  const neverPlayed = stats.filter(s => s.matchesPlayed === 0).length;

  // H2H
  let maxH2H = 0;
  let totalH2H = 0;
  let h2hChecks = 0;
  for (let i = 0; i < playerIds.length; i++) {
    const profileRes = await request(app).get(`/api/sessions/${sessionId}/players/${playerIds[i]}/profile`);
    if (profileRes.status === 200 && profileRes.body.headToHead) {
      const headToHead: Array<{ encounters: number }> = profileRes.body.headToHead;
      for (const h of headToHead) {
        if (h.encounters > maxH2H) maxH2H = h.encounters;
        totalH2H += h.encounters;
        h2hChecks++;
      }
    }
  }
  const avgH2H = h2hChecks > 0 ? (totalH2H / h2hChecks).toFixed(2) : '0';

  return { completedMatches, avgMatches, minMatches, maxMatches, deviation, neverPlayed, maxH2H, avgH2H };
}

describe('Casual pool size comparison: 60 players, 6 pairs, 5 courts, 120 matches', () => {
  afterEach(() => {
    setCasualPoolSize(8); // Reset to default
  });

  it('Pool size 6', { timeout: 120000 }, async () => {
    cleanDb();
    setCasualPoolSize(6);
    const r = await runTest(60, 120, 6);
    console.log(`\n=== POOL 6: 60p, 5 courts, 120 matches ===`);
    console.log(`Completed: ${r.completedMatches} | Avg: ${r.avgMatches.toFixed(1)} | Min: ${r.minMatches} | Max: ${r.maxMatches} | Dev: ${r.deviation}`);
    console.log(`Max H2H: ${r.maxH2H} | Avg H2H: ${r.avgH2H} | Never played: ${r.neverPlayed}`);
    expect(r.deviation).toBeLessThanOrEqual(3);
    expect(r.maxH2H).toBeLessThanOrEqual(6);
  });

  it('Pool size 7', { timeout: 120000 }, async () => {
    cleanDb();
    setCasualPoolSize(7);
    const r = await runTest(60, 120, 6);
    console.log(`\n=== POOL 7: 60p, 5 courts, 120 matches ===`);
    console.log(`Completed: ${r.completedMatches} | Avg: ${r.avgMatches.toFixed(1)} | Min: ${r.minMatches} | Max: ${r.maxMatches} | Dev: ${r.deviation}`);
    console.log(`Max H2H: ${r.maxH2H} | Avg H2H: ${r.avgH2H} | Never played: ${r.neverPlayed}`);
    expect(r.deviation).toBeLessThanOrEqual(3);
    expect(r.maxH2H).toBeLessThanOrEqual(6);
  });

  it('Pool size 8', { timeout: 120000 }, async () => {
    cleanDb();
    setCasualPoolSize(8);
    const r = await runTest(60, 120, 6);
    console.log(`\n=== POOL 8: 60p, 5 courts, 120 matches ===`);
    console.log(`Completed: ${r.completedMatches} | Avg: ${r.avgMatches.toFixed(1)} | Min: ${r.minMatches} | Max: ${r.maxMatches} | Dev: ${r.deviation}`);
    console.log(`Max H2H: ${r.maxH2H} | Avg H2H: ${r.avgH2H} | Never played: ${r.neverPlayed}`);
    expect(r.deviation).toBeLessThanOrEqual(3);
    expect(r.maxH2H).toBeLessThanOrEqual(6);
  });
});

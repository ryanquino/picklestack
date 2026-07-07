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

async function runModeTest(mode: string, players: number, courts: number, pairs: number, matches: number) {
  const createRes = await request(app)
    .post('/api/sessions')
    .send({ name: `${mode} Test`, courtCount: courts });
  const sessionId = createRes.body.id;

  // Set matching mode via pairing-mode endpoint
  await request(app)
    .put(`/api/sessions/${sessionId}/pairing-mode`)
    .send({ mode });

  await request(app)
    .put(`/api/sessions/${sessionId}/settings`)
    .send({
      name: `${mode} Test`,
      courtCount: courts,
      courtName: '',
      sessionType: 'open_play',
      gameMode: 'doubles',
      matchingMode: mode,
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
  let completed = 0;
  for (let i = 0; i < matches; i++) {
    const courtNumber = (i % courts) + 1;
    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/courts/${courtNumber}/start`)
      .send();
    if (startRes.status !== 201) continue;
    completed++;
    await request(app)
      .post(`/api/sessions/${sessionId}/courts/${courtNumber}/complete`)
      .send({ winningTeam: i % 2 === 0 ? 'team1' : 'team2' });
  }

  // Get stats
  const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
  const stats: Array<{ playerId: string; playerName: string; matchesPlayed: number }> = statsRes.body;

  const matchCounts = stats.map(s => s.matchesPlayed).filter(m => m > 0);
  const avg = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
  const min = Math.min(...matchCounts);
  const max = Math.max(...matchCounts);
  const dev = max - min;

  const indStats = stats.filter(s => !pairPlayerIds.includes(s.playerId));
  const pairStats = stats.filter(s => pairPlayerIds.includes(s.playerId));
  const indAvg = indStats.length > 0 ? indStats.reduce((s, x) => s + x.matchesPlayed, 0) / indStats.length : 0;
  const pairAvg = pairStats.length > 0 ? pairStats.reduce((s, x) => s + x.matchesPlayed, 0) / pairStats.length : 0;

  // H2H
  let maxH2H = 0;
  const profileRes = await request(app).get(`/api/sessions/${sessionId}/players/${playerIds[0]}/profile`);
  if (profileRes.status === 200) {
    const h2h: Array<{ encounters: number }> = profileRes.body.headToHead ?? [];
    maxH2H = h2h.length > 0 ? Math.max(...h2h.map(h => h.encounters)) : 0;
  }

  return { completed, avg, min, max, dev, indAvg, pairAvg, maxH2H };
}

describe('Matching modes comparison: 30 players, 3 courts, 3 pairs, 60 matches', () => {
  it('Casual mode', { timeout: 60000 }, async () => {
    const r = await runModeTest('casual', 30, 3, 3, 60);
    console.log('\n=== CASUAL: 30p / 3c / 3 pairs / 60m ===');
    console.log(`Completed: ${r.completed} | Avg: ${r.avg.toFixed(1)} | Min: ${r.min} | Max: ${r.max} | Dev: ${r.dev}`);
    console.log(`Ind avg: ${r.indAvg.toFixed(1)} | Pair avg: ${r.pairAvg.toFixed(1)} | Max H2H: ${r.maxH2H}`);
    expect(r.dev).toBeLessThanOrEqual(4);
    expect(r.maxH2H).toBeLessThanOrEqual(2); // Casual prioritizes no-repeat
  });

  it('Smart (balanced) mode', { timeout: 60000 }, async () => {
    const r = await runModeTest('balanced', 30, 3, 3, 60);
    console.log('\n=== SMART (BALANCED): 30p / 3c / 3 pairs / 60m ===');
    console.log(`Completed: ${r.completed} | Avg: ${r.avg.toFixed(1)} | Min: ${r.min} | Max: ${r.max} | Dev: ${r.dev}`);
    console.log(`Ind avg: ${r.indAvg.toFixed(1)} | Pair avg: ${r.pairAvg.toFixed(1)} | Max H2H: ${r.maxH2H}`);
    expect(r.dev).toBeLessThanOrEqual(4);
  });

  it('Competitive mode', { timeout: 60000 }, async () => {
    const r = await runModeTest('competitive', 30, 3, 3, 60);
    console.log('\n=== COMPETITIVE: 30p / 3c / 3 pairs / 60m ===');
    console.log(`Completed: ${r.completed} | Avg: ${r.avg.toFixed(1)} | Min: ${r.min} | Max: ${r.max} | Dev: ${r.dev}`);
    console.log(`Ind avg: ${r.indAvg.toFixed(1)} | Pair avg: ${r.pairAvg.toFixed(1)} | Max H2H: ${r.maxH2H}`);
    // Competitive allows more deviation — skill gap is priority
    expect(r.completed).toBeGreaterThanOrEqual(50);
  });
});

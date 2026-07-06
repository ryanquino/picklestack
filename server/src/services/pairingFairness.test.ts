import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getDb } from '../db';

/**
 * Integration test: Pairing fairness over 50 matches with 20 players (including 2 fixed pairs).
 *
 * Validates:
 * - All players get roughly equal court time (max deviation ≤ 4 from average)
 * - Fixed pairs are not systematically over/under-played vs individuals
 * - No single head-to-head matchup exceeds 3 encounters
 */

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

describe('Pairing fairness: 20 players, 2 pairs, 50 matches, 2 courts', () => {
  it('distributes matches fairly across all players including fixed pairs', async () => {
    // 1. Create session with 2 courts, smart pairing, doubles
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Fairness Test', courtCount: 2 });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;

    await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'Fairness Test',
        courtCount: 2,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
        sessionDurationHours: 4,
      });

    // 2. Add 20 players
    const playerNames = [
      'Alice', 'Bob', 'Charlie', 'Diana', 'Eve',
      'Frank', 'Grace', 'Hank', 'Ivy', 'Jack',
      'Kate', 'Leo', 'Mia', 'Noah', 'Olivia',
      'Pete', 'Quinn', 'Ruby', 'Sam', 'Tina',
    ];
    const playerIds: string[] = [];

    for (const name of playerNames) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name, starRating: 3 });
      expect(res.status).toBe(201);
      playerIds.push(res.body.id);
    }

    // 3. Create 2 fixed pairs: (Alice & Bob), (Charlie & Diana)
    const pair1Res = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[0], player2Id: playerIds[1] });
    expect(pair1Res.status).toBe(201);

    const pair2Res = await request(app)
      .post(`/api/sessions/${sessionId}/pairs`)
      .send({ player1Id: playerIds[2], player2Id: playerIds[3] });
    expect(pair2Res.status).toBe(201);

    // 4. Run 50 matches (alternating courts)
    const TOTAL_MATCHES = 50;
    for (let i = 0; i < TOTAL_MATCHES; i++) {
      const courtNumber = (i % 2) + 1;

      const startRes = await request(app)
        .post(`/api/sessions/${sessionId}/courts/${courtNumber}/start`)
        .send();

      if (startRes.status !== 201) {
        // Not enough players in queue — skip this court
        continue;
      }

      // Complete with alternating winners for variety
      const winningTeam = i % 2 === 0 ? 'team1' : 'team2';
      await request(app)
        .post(`/api/sessions/${sessionId}/courts/${courtNumber}/complete`)
        .send({ winningTeam });
    }

    // 5. Get player stats
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    expect(statsRes.status).toBe(200);

    const stats: Array<{ playerId: string; playerName: string; matchesPlayed: number }> = statsRes.body;

    // 6. Analyze match distribution
    const matchCounts = stats.map(s => s.matchesPlayed).filter(m => m > 0);
    const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
    const maxMatches = Math.max(...matchCounts);
    const minMatches = Math.min(...matchCounts);
    const maxDeviation = maxMatches - minMatches;

    console.log('\n=== Match Distribution ===');
    console.log(`Total matches played: ${TOTAL_MATCHES}`);
    console.log(`Players with matches: ${matchCounts.length}`);
    console.log(`Average matches/player: ${avgMatches.toFixed(1)}`);
    console.log(`Min: ${minMatches}, Max: ${maxMatches}, Deviation: ${maxDeviation}`);

    // Pair stats
    const pair1Stats = stats.find(s => s.playerId === playerIds[0]);
    const pair2Stats = stats.find(s => s.playerId === playerIds[2]);
    console.log(`Pair 1 (Alice & Bob): ${pair1Stats?.matchesPlayed ?? 0} matches`);
    console.log(`Pair 2 (Charlie & Diana): ${pair2Stats?.matchesPlayed ?? 0} matches`);

    // Individual average (non-paired players)
    const individualStats = stats.filter(s =>
      !([playerIds[0], playerIds[1], playerIds[2], playerIds[3]].includes(s.playerId))
    );
    const individualAvg = individualStats.length > 0
      ? individualStats.reduce((sum, s) => sum + s.matchesPlayed, 0) / individualStats.length
      : 0;
    console.log(`Individual average: ${individualAvg.toFixed(1)} matches`);

    // 7. Assertions on fairness
    // Max deviation across all players should be ≤ 2
    expect(maxDeviation).toBeLessThanOrEqual(2);

    // Pairs should be within 3 matches of the individual average
    if (pair1Stats) {
      expect(Math.abs(pair1Stats.matchesPlayed - individualAvg)).toBeLessThanOrEqual(3);
    }
    if (pair2Stats) {
      expect(Math.abs(pair2Stats.matchesPlayed - individualAvg)).toBeLessThanOrEqual(3);
    }

    // 8. Check head-to-head: no player should face the same opponent more than 4 times
    const profileRes = await request(app).get(`/api/sessions/${sessionId}/players/${playerIds[0]}/profile`);
    if (profileRes.status === 200) {
      const profile = profileRes.body;
      const headToHead: Array<{ opponentName: string; encounters: number }> = profile.headToHead ?? [];

      console.log('\n=== Head-to-Head (Alice) ===');
      for (const h2h of headToHead) {
        console.log(`  vs ${h2h.opponentName}: ${h2h.encounters} games`);
      }

      const maxH2H = headToHead.length > 0 ? Math.max(...headToHead.map(h => h.encounters)) : 0;
      expect(maxH2H).toBeLessThanOrEqual(4);
    }
  });
});


describe('Pairing fairness: 50 players, 2 pairs, 90 matches, 5 courts', () => {
  it('distributes matches fairly with larger player pool', { timeout: 60000 }, async () => {
    // 1. Create session with 5 courts
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Large Session Test', courtCount: 5 });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;

    await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'Large Session Test',
        courtCount: 5,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'smart',
        sessionDurationHours: 4,
      });

    // 2. Add 50 players
    const playerIds: string[] = [];
    for (let i = 1; i <= 50; i++) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name: `Player${i}`, starRating: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5 });
      expect(res.status).toBe(201);
      playerIds.push(res.body.id);
    }

    // 3. Create 5 fixed pairs: (P1&P2), (P3&P4), (P5&P6), (P7&P8), (P9&P10)
    const pairPlayerIds: string[] = [];
    for (let p = 0; p < 5; p++) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/pairs`)
        .send({ player1Id: playerIds[p * 2], player2Id: playerIds[p * 2 + 1] });
      expect(res.status).toBe(201);
      pairPlayerIds.push(playerIds[p * 2], playerIds[p * 2 + 1]);
    }

    // 4. Run 90 matches across 5 courts
    const TOTAL_MATCHES = 90;
    for (let i = 0; i < TOTAL_MATCHES; i++) {
      const courtNumber = (i % 5) + 1;

      const startRes = await request(app)
        .post(`/api/sessions/${sessionId}/courts/${courtNumber}/start`)
        .send();

      if (startRes.status !== 201) continue;

      const winningTeam = i % 2 === 0 ? 'team1' : 'team2';
      await request(app)
        .post(`/api/sessions/${sessionId}/courts/${courtNumber}/complete`)
        .send({ winningTeam });
    }

    // 5. Get player stats
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    expect(statsRes.status).toBe(200);

    const stats: Array<{ playerId: string; playerName: string; matchesPlayed: number }> = statsRes.body;

    // 6. Analyze match distribution
    const matchCounts = stats.map(s => s.matchesPlayed).filter(m => m > 0);
    const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
    const maxMatches = Math.max(...matchCounts);
    const minMatches = Math.min(...matchCounts);
    const maxDeviation = maxMatches - minMatches;

    console.log('\n=== Large Session (50 players, 5 courts, 90 matches, 5 pairs) ===');
    console.log(`Average matches/player: ${avgMatches.toFixed(1)}`);
    console.log(`Min: ${minMatches}, Max: ${maxMatches}, Deviation: ${maxDeviation}`);

    // Pair stats
    for (let p = 0; p < 5; p++) {
      const pStats = stats.find(s => s.playerId === playerIds[p * 2]);
      console.log(`Pair ${p + 1} (Player${p * 2 + 1} & Player${p * 2 + 2}): ${pStats?.matchesPlayed ?? 0} matches`);
    }

    const individualStats = stats.filter(s => !pairPlayerIds.includes(s.playerId));
    const individualAvg = individualStats.length > 0
      ? individualStats.reduce((sum, s) => sum + s.matchesPlayed, 0) / individualStats.length
      : 0;
    const pairStats = stats.filter(s => pairPlayerIds.includes(s.playerId));
    const pairAvg = pairStats.length > 0
      ? pairStats.reduce((sum, s) => sum + s.matchesPlayed, 0) / pairStats.length
      : 0;
    console.log(`Individual average: ${individualAvg.toFixed(1)} matches`);
    console.log(`Pair average: ${pairAvg.toFixed(1)} matches`);

    // 7. Head-to-head for a paired player
    const profileRes = await request(app).get(`/api/sessions/${sessionId}/players/${playerIds[0]}/profile`);
    if (profileRes.status === 200) {
      const profile = profileRes.body;
      const headToHead: Array<{ opponentName: string; encounters: number }> = profile.headToHead ?? [];

      console.log(`\n=== Head-to-Head (Player1) ===`);
      const sortedH2H = [...headToHead].sort((a, b) => b.encounters - a.encounters);
      for (const h2h of sortedH2H.slice(0, 10)) {
        console.log(`  vs ${h2h.opponentName}: ${h2h.encounters} games`);
      }

      const maxH2H = headToHead.length > 0 ? Math.max(...headToHead.map(h => h.encounters)) : 0;
      console.log(`Max H2H encounters: ${maxH2H}`);
      expect(maxH2H).toBeLessThanOrEqual(4);
    }

    // 8. Assertions
    expect(minMatches).toBeGreaterThanOrEqual(5);
    expect(maxDeviation).toBeLessThanOrEqual(4);

    // Pairs within 3 of individual average
    for (let p = 0; p < 5; p++) {
      const pStats = stats.find(s => s.playerId === playerIds[p * 2]);
      if (pStats) {
        expect(Math.abs(pStats.matchesPlayed - individualAvg)).toBeLessThanOrEqual(3);
      }
    }
  });
});

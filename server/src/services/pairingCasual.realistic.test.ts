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

describe('Casual mode: realistic 50-player open play simulation', () => {
  it('50 players, 5 courts, staggered entry, 6 pairs, ~80 matches', { timeout: 120000 }, async () => {
    // --- Setup ---
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Realistic Casual 50p', courtCount: 5 });
    const sessionId = createRes.body.id;

    await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'Realistic Casual 50p',
        courtCount: 5,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'casual',
        sessionDurationHours: 4,
      });

    // --- Add initial 30 players ---
    const playerIds: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name: `P${i}`, starRating: ((i % 5) + 1) });
      playerIds.push(res.body.id);
    }

    // --- Create 3 initial pairs (P1&P2, P3&P4, P5&P6) ---
    await request(app).post(`/api/sessions/${sessionId}/pairs`).send({ player1Id: playerIds[0], player2Id: playerIds[1] });
    await request(app).post(`/api/sessions/${sessionId}/pairs`).send({ player1Id: playerIds[2], player2Id: playerIds[3] });
    await request(app).post(`/api/sessions/${sessionId}/pairs`).send({ player1Id: playerIds[4], player2Id: playerIds[5] });

    // --- Simulate matches ---
    // 4 hours / ~12.5 min per game / 5 courts = ~96 total matches
    // We'll run 80 matches to simulate a realistic session
    const totalMatches = 80;
    let completedMatches = 0;
    let matchRound = 0;

    for (let i = 0; i < totalMatches; i++) {
      const courtNumber = (i % 5) + 1;

      // Track rounds (every 5 matches = 1 round since 5 courts)
      const currentRound = Math.floor(i / 5);

      // Add 10 players after round 1 (matches 5-9 done)
      if (currentRound === 1 && matchRound < 1) {
        matchRound = 1;
        for (let j = 31; j <= 40; j++) {
          const res = await request(app)
            .post(`/api/sessions/${sessionId}/players`)
            .send({ name: `P${j}`, starRating: ((j % 5) + 1) });
          playerIds.push(res.body.id);
        }
        // Add 1 pair (P31&P32)
        await request(app).post(`/api/sessions/${sessionId}/pairs`).send({ player1Id: playerIds[30], player2Id: playerIds[31] });
      }

      // Add 5 players after round 2 (matches 10-14 done)
      if (currentRound === 2 && matchRound < 2) {
        matchRound = 2;
        for (let j = 41; j <= 45; j++) {
          const res = await request(app)
            .post(`/api/sessions/${sessionId}/players`)
            .send({ name: `P${j}`, starRating: ((j % 5) + 1) });
          playerIds.push(res.body.id);
        }
        // Add 1 pair (P41&P42)
        await request(app).post(`/api/sessions/${sessionId}/pairs`).send({ player1Id: playerIds[40], player2Id: playerIds[41] });
      }

      // Add 5 players after round 3 (matches 15-19 done)
      if (currentRound === 3 && matchRound < 3) {
        matchRound = 3;
        for (let j = 46; j <= 50; j++) {
          const res = await request(app)
            .post(`/api/sessions/${sessionId}/players`)
            .send({ name: `P${j}`, starRating: ((j % 5) + 1) });
          playerIds.push(res.body.id);
        }
        // Add 1 pair (P46&P47)
        await request(app).post(`/api/sessions/${sessionId}/pairs`).send({ player1Id: playerIds[45], player2Id: playerIds[46] });
      }

      // Start match
      const startRes = await request(app)
        .post(`/api/sessions/${sessionId}/courts/${courtNumber}/start`)
        .send();
      if (startRes.status !== 201) continue;
      completedMatches++;

      // Complete match with alternating winners
      const winningTeam = i % 2 === 0 ? 'team1' : 'team2';
      await request(app)
        .post(`/api/sessions/${sessionId}/courts/${courtNumber}/complete`)
        .send({ winningTeam });
    }

    // --- Gather stats ---
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    const stats: Array<{ playerId: string; playerName: string; matchesPlayed: number; wins: number; losses: number }> = statsRes.body;

    const matchCounts = stats.map(s => s.matchesPlayed).filter(m => m > 0);
    const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
    const maxMatches = Math.max(...matchCounts);
    const minMatches = Math.min(...matchCounts);
    const deviation = maxMatches - minMatches;

    // Players who never played
    const neverPlayed = stats.filter(s => s.matchesPlayed === 0).length;

    // H2H analysis - check first 10 players
    let maxH2H = 0;
    let totalH2H = 0;
    let h2hChecks = 0;
    for (let i = 0; i < Math.min(10, playerIds.length); i++) {
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

    // Estimate average wait time
    // With 5 courts, 50 players, ~12.5 min games:
    // Each round fills 5 courts x 4 players = 20 players playing
    // 30 players waiting per round initially
    // Average wait = (players in queue / players per round) * match duration
    const avgMatchDurationMin = 12.5;
    const playersPerRound = 20; // 5 courts x 4 players
    const avgQueueSize = 50 - playersPerRound; // ~30 waiting at any time
    const estimatedAvgWaitMin = (avgQueueSize / playersPerRound) * avgMatchDurationMin;

    // Group stats by entry wave
    const wave1Stats = stats.filter(s => {
      const idx = playerIds.indexOf(s.playerId);
      return idx >= 0 && idx < 30;
    });
    const wave2Stats = stats.filter(s => {
      const idx = playerIds.indexOf(s.playerId);
      return idx >= 30 && idx < 40;
    });
    const wave3Stats = stats.filter(s => {
      const idx = playerIds.indexOf(s.playerId);
      return idx >= 40 && idx < 45;
    });
    const wave4Stats = stats.filter(s => {
      const idx = playerIds.indexOf(s.playerId);
      return idx >= 45 && idx < 50;
    });

    const wave1Avg = wave1Stats.length > 0 ? (wave1Stats.reduce((sum, s) => sum + s.matchesPlayed, 0) / wave1Stats.length).toFixed(1) : '0';
    const wave2Avg = wave2Stats.length > 0 ? (wave2Stats.reduce((sum, s) => sum + s.matchesPlayed, 0) / wave2Stats.length).toFixed(1) : '0';
    const wave3Avg = wave3Stats.length > 0 ? (wave3Stats.reduce((sum, s) => sum + s.matchesPlayed, 0) / wave3Stats.length).toFixed(1) : '0';
    const wave4Avg = wave4Stats.length > 0 ? (wave4Stats.reduce((sum, s) => sum + s.matchesPlayed, 0) / wave4Stats.length).toFixed(1) : '0';

    console.log('\n=== REALISTIC CASUAL MODE: 50 Players, 5 Courts, 80 Matches ===');
    console.log(`Completed: ${completedMatches} matches`);
    console.log(`\n--- Games Played ---`);
    console.log(`Average: ${avgMatches.toFixed(1)} | Min: ${minMatches} | Max: ${maxMatches} | Deviation: ${deviation}`);
    console.log(`Never played: ${neverPlayed} players`);
    console.log(`\n--- By Entry Wave ---`);
    console.log(`Wave 1 (initial 30): avg ${wave1Avg} games`);
    console.log(`Wave 2 (+10 after round 1): avg ${wave2Avg} games`);
    console.log(`Wave 3 (+5 after round 2): avg ${wave3Avg} games`);
    console.log(`Wave 4 (+5 after round 3): avg ${wave4Avg} games`);
    console.log(`\n--- Head-to-Head ---`);
    console.log(`Max H2H: ${maxH2H} | Avg H2H: ${avgH2H}`);
    console.log(`\n--- Estimated Wait Time ---`);
    console.log(`Avg queue size: ~${avgQueueSize} players`);
    console.log(`Estimated avg wait: ~${estimatedAvgWaitMin.toFixed(0)} minutes between games`);
    console.log(`Actual games/player/hour: ~${(avgMatches / 4).toFixed(1)} (over 4 hrs)`);
    console.log(`\n--- Session Summary ---`);
    console.log(`Total players: 50 | Pairs: 6 | Courts: 5`);
    console.log(`Match duration: ~12.5 min | Session: 4 hours`);
    console.log(`Theoretical max matches: ~96 (5 courts x 4hrs / 12.5min)`);

    // Assertions
    expect(completedMatches).toBeGreaterThanOrEqual(70);
    expect(maxH2H).toBeLessThanOrEqual(3); // casual allows some repeats to prioritize wait time
    expect(neverPlayed).toBeLessThanOrEqual(2); // almost everyone should play
    expect(deviation).toBeLessThanOrEqual(6); // reasonable spread given staggered entry
  });

  it('50 players ALL paired (25 pairs), 5 courts, staggered entry, 80 matches', { timeout: 120000 }, async () => {
    // --- Setup ---
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'All Paired 50p', courtCount: 5 });
    const sessionId = createRes.body.id;

    await request(app)
      .put(`/api/sessions/${sessionId}/settings`)
      .send({
        name: 'All Paired 50p',
        courtCount: 5,
        courtName: '',
        sessionType: 'open_play',
        gameMode: 'doubles',
        matchingMode: 'casual',
        sessionDurationHours: 4,
      });

    // --- Add initial 24 players (12 pairs) ---
    const playerIds: string[] = [];
    for (let i = 1; i <= 24; i++) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/players`)
        .send({ name: `P${i}`, starRating: ((i % 5) + 1) });
      playerIds.push(res.body.id);
    }

    // Create 12 initial pairs
    for (let p = 0; p < 12; p++) {
      await request(app)
        .post(`/api/sessions/${sessionId}/pairs`)
        .send({ player1Id: playerIds[p * 2], player2Id: playerIds[p * 2 + 1] });
    }

    // --- Run 80 matches with staggered entry ---
    let completedMatches = 0;
    let matchRound = 0;

    for (let i = 0; i < 80; i++) {
      const courtNumber = (i % 5) + 1;
      const currentRound = Math.floor(i / 5);

      // Add 12 players (6 pairs) after round 1
      if (currentRound === 1 && matchRound < 1) {
        matchRound = 1;
        for (let j = 25; j <= 36; j++) {
          const res = await request(app)
            .post(`/api/sessions/${sessionId}/players`)
            .send({ name: `P${j}`, starRating: ((j % 5) + 1) });
          playerIds.push(res.body.id);
        }
        for (let p = 0; p < 6; p++) {
          const base = 24 + p * 2; // indices 24-35
          await request(app)
            .post(`/api/sessions/${sessionId}/pairs`)
            .send({ player1Id: playerIds[base], player2Id: playerIds[base + 1] });
        }
      }

      // Add 8 players (4 pairs) after round 2
      if (currentRound === 2 && matchRound < 2) {
        matchRound = 2;
        for (let j = 37; j <= 44; j++) {
          const res = await request(app)
            .post(`/api/sessions/${sessionId}/players`)
            .send({ name: `P${j}`, starRating: ((j % 5) + 1) });
          playerIds.push(res.body.id);
        }
        for (let p = 0; p < 4; p++) {
          const base = 36 + p * 2; // indices 36-43
          await request(app)
            .post(`/api/sessions/${sessionId}/pairs`)
            .send({ player1Id: playerIds[base], player2Id: playerIds[base + 1] });
        }
      }

      // Add 6 players (3 pairs) after round 3
      if (currentRound === 3 && matchRound < 3) {
        matchRound = 3;
        for (let j = 45; j <= 50; j++) {
          const res = await request(app)
            .post(`/api/sessions/${sessionId}/players`)
            .send({ name: `P${j}`, starRating: ((j % 5) + 1) });
          playerIds.push(res.body.id);
        }
        for (let p = 0; p < 3; p++) {
          const base = 44 + p * 2; // indices 44-49
          await request(app)
            .post(`/api/sessions/${sessionId}/pairs`)
            .send({ player1Id: playerIds[base], player2Id: playerIds[base + 1] });
        }
      }

      // Start match
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

    // --- Gather stats ---
    const statsRes = await request(app).get(`/api/sessions/${sessionId}/stats`);
    const stats: Array<{ playerId: string; playerName: string; matchesPlayed: number }> = statsRes.body;

    const matchCounts = stats.map(s => s.matchesPlayed).filter(m => m > 0);
    const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
    const maxMatches = Math.max(...matchCounts);
    const minMatches = Math.min(...matchCounts);
    const deviation = maxMatches - minMatches;
    const neverPlayed = stats.filter(s => s.matchesPlayed === 0).length;

    // H2H analysis
    let maxH2H = 0;
    let totalH2H = 0;
    let h2hChecks = 0;
    for (let i = 0; i < Math.min(10, playerIds.length); i++) {
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

    // Pair integrity check (first 5 pairs)
    let pairAlwaysTogether = 0;
    let pairSometimesSplit = 0;
    for (let p = 0; p < 5; p++) {
      const p1Id = playerIds[p * 2];
      const p2Id = playerIds[p * 2 + 1];
      const profileRes = await request(app).get(`/api/sessions/${sessionId}/players/${p1Id}/profile`);
      if (profileRes.status === 200 && profileRes.body.matchHistory) {
        const history: Array<{ teammateIds: string[] }> = profileRes.body.matchHistory;
        const withPartner = history.filter(m => m.teammateIds.includes(p2Id)).length;
        if (withPartner === history.length) {
          pairAlwaysTogether++;
        } else {
          pairSometimesSplit++;
        }
      }
    }

    // Group stats by entry wave
    const wave1Stats = stats.filter(s => { const idx = playerIds.indexOf(s.playerId); return idx >= 0 && idx < 24; });
    const wave2Stats = stats.filter(s => { const idx = playerIds.indexOf(s.playerId); return idx >= 24 && idx < 36; });
    const wave3Stats = stats.filter(s => { const idx = playerIds.indexOf(s.playerId); return idx >= 36 && idx < 44; });
    const wave4Stats = stats.filter(s => { const idx = playerIds.indexOf(s.playerId); return idx >= 44 && idx < 50; });

    const wave1Avg = wave1Stats.length > 0 ? (wave1Stats.reduce((sum, s) => sum + s.matchesPlayed, 0) / wave1Stats.length).toFixed(1) : '0';
    const wave2Avg = wave2Stats.length > 0 ? (wave2Stats.reduce((sum, s) => sum + s.matchesPlayed, 0) / wave2Stats.length).toFixed(1) : '0';
    const wave3Avg = wave3Stats.length > 0 ? (wave3Stats.reduce((sum, s) => sum + s.matchesPlayed, 0) / wave3Stats.length).toFixed(1) : '0';
    const wave4Avg = wave4Stats.length > 0 ? (wave4Stats.reduce((sum, s) => sum + s.matchesPlayed, 0) / wave4Stats.length).toFixed(1) : '0';

    console.log('\n=== ALL PAIRED STAGGERED: 50 Players (25 Pairs), 5 Courts, 80 Matches ===');
    console.log(`Completed: ${completedMatches} matches`);
    console.log(`\n--- Games Played ---`);
    console.log(`Average: ${avgMatches.toFixed(1)} | Min: ${minMatches} | Max: ${maxMatches} | Deviation: ${deviation}`);
    console.log(`Never played: ${neverPlayed} players`);
    console.log(`\n--- By Entry Wave ---`);
    console.log(`Wave 1 (12 pairs initial): avg ${wave1Avg} games`);
    console.log(`Wave 2 (+6 pairs round 1): avg ${wave2Avg} games`);
    console.log(`Wave 3 (+4 pairs round 2): avg ${wave3Avg} games`);
    console.log(`Wave 4 (+3 pairs round 3): avg ${wave4Avg} games`);
    console.log(`\n--- Head-to-Head ---`);
    console.log(`Max H2H: ${maxH2H} | Avg H2H: ${avgH2H}`);
    console.log(`\n--- Pair Integrity (first 5 pairs) ---`);
    console.log(`Always together: ${pairAlwaysTogether}/5 | Sometimes split: ${pairSometimesSplit}/5`);
    console.log(`\n--- Estimated Wait Time ---`);
    const avgQueueSize = 50 - 20;
    const estimatedAvgWaitMin = (avgQueueSize / 20) * 12.5;
    console.log(`Estimated avg wait: ~${estimatedAvgWaitMin.toFixed(0)} minutes between games`);
    console.log(`Actual games/player/hour: ~${(avgMatches / 4).toFixed(1)} (over 4 hrs)`);

    // Assertions
    expect(completedMatches).toBeGreaterThanOrEqual(70);
    expect(maxH2H).toBeLessThanOrEqual(2);
    expect(neverPlayed).toBeLessThanOrEqual(2);
    expect(deviation).toBeLessThanOrEqual(6);
    expect(pairAlwaysTogether).toBe(5); // pairs should never be split
  });
});

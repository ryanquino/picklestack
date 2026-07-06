# Implementation Plan: Smart Match Scoring

## Overview

This plan implements match result tracking, Elo-like player ratings with star tiers, skill-based pairing, matchup variety constraints, player statistics, match history, head-to-head records, player profile cards, and session achievements for the Picklestack app. The implementation builds incrementally: database schema first, then core services (rating → pairing → match results → achievements), then API endpoints, and finally frontend components.

## Tasks

- [x] 1. Database schema and type definitions
  - [x] 1.1 Add new database tables and modify existing schema
    - Add `match_results` table (id, match_id, session_id, winner_player_ids, loser_player_ids, recorded_at, updated_at)
    - Add `player_ratings` table (player_id, session_id, rating, matches_played, wins, losses, star_rating)
    - Add `pairing_history` table (session_id, player1_id, player2_id, times_as_teammates, times_as_opponents)
    - Add `pairing_mode` column to sessions table (TEXT NOT NULL DEFAULT 'smart')
    - Update `db.ts` to include new CREATE TABLE statements
    - _Requirements: 1.2, 2.1, 4.1, 4.2, 6.4, 8.2_

  - [x] 1.2 Define new TypeScript types and interfaces
    - Add `MatchResult`, `PlayerRating`, `PlayerStats`, `LeaderboardEntry`, `PairingMode` types to `server/src/types.ts`
    - Add `Achievement` type with enum for achievement kinds (IronPlayer, Undefeated, HotStreak, ComebackKing, SocialButterfly)
    - Add `MatchHistoryEntry`, `HeadToHeadRecord`, `PlayerProfile` types
    - Add `StarRating` type (1-5) and star-to-rating mapping constants
    - _Requirements: 1.2, 2.1, 5.1, 7.1, 8.1, 9.1, 10.1, 11.2, 12.1_

  - [x] 1.3 Add repository functions for new tables
    - Add CRUD functions for `match_results` table in `repository.ts`
    - Add CRUD functions for `player_ratings` table (upsert pattern for rating updates)
    - Add CRUD functions for `pairing_history` table (increment teammate/opponent counts)
    - Add `updateSessionPairingMode` function
    - Add query for matches by player ID (for match history)
    - Add query for head-to-head records between players
    - _Requirements: 1.2, 1.5, 2.2, 4.1, 4.2, 6.4, 9.1, 10.1_

- [x] 2. Implement rating service
  - [x] 2.1 Create `server/src/services/ratingService.ts`
    - Implement `calculateRatingAdjustment(winnerAvgRating, loserAvgRating, basePoints)` as a pure function
    - Implement scaling formula: `scaleFactor = clamp(1.0 - (winnerAvg - loserAvg) / 400, 0.5, 1.5)`
    - Implement `applyMatchResult(sessionId, winnerIds, loserIds)` to update player_ratings table
    - Implement `getPlayerRating(sessionId, playerId)` returning current rating or default
    - Implement `getSessionRatings(sessionId)` returning all ratings for a session
    - Implement `initializePlayerRating(sessionId, playerId, starRating)` to set initial rating from star tier
    - Implement star-to-rating mapping: 1→400, 2→700, 3→1000, 4→1300, 5→1600
    - Implement rating-to-star derivation: 100-599→1, 600-899→2, 900-1099→3, 1100-1399→4, 1400+→5
    - Clamp all ratings to [100, 3000]
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.2, 8.4_

  - [x] 2.2 Write property tests for rating calculation (Property 2)
    - **Property 2: Rating adjustment bounds and direction**
    - Test that adjustment is always between 8 and 24 (basePoints × [0.5, 1.5])
    - Test that underdogs gain more than 16, favorites gain less than 16
    - **Validates: Requirements 2.2, 2.3**

  - [x] 2.3 Write property tests for rating bounds (Property 3)
    - **Property 3: Rating bounds invariant**
    - Test that after any sequence of wins/losses, rating stays in [100, 3000]
    - **Validates: Requirements 2.4**

  - [x] 2.4 Write property tests for win rate calculation (Property 11)
    - **Property 11: Win rate calculation**
    - Test that winRate = W / (W + L) × 100 rounded to one decimal, or 0.0 if no matches
    - **Validates: Requirements 7.2**

- [x] 3. Implement pairing service
  - [x] 3.1 Create `server/src/services/pairingService.ts`
    - Implement `selectPairing(input: PairingInput): PairingResult` as a pure function
    - Implement candidate pool selection (top min(N, 8) from queue)
    - Implement random selection when all candidates have no match history
    - Implement enumeration of all C(n,4) player selections and 3 team splits per selection
    - Implement skill gap calculation: `|avg(team1) - avg(team2)|`
    - Implement teammate repetition filter (threshold > 2, unless all exceed)
    - Implement matchup repetition filter (same 4 in same config, unless all exceed)
    - Implement tiebreakers: lowest same-team frequency sum, then earliest queue position
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 4.3, 4.4, 4.5_

  - [x] 3.2 Write property tests for candidate pool size (Property 4)
    - **Property 4: Candidate pool size**
    - Test that pool is exactly min(N, 8) players from front of queue
    - **Validates: Requirements 3.2**

  - [x] 3.3 Write property tests for pairing optimality (Property 5)
    - **Property 5: Pairing optimality**
    - Test that selected combination has minimum skill gap among all valid options
    - Test tiebreaker ordering (teammate frequency, then queue position)
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [x] 3.4 Write property tests for queue integrity (Property 6)
    - **Property 6: Queue integrity after pairing**
    - Test that after removing 4 players, remaining queue has N-4 entries with contiguous positions preserving relative order
    - **Validates: Requirements 3.8**

  - [x] 3.5 Write property tests for variety constraints (Property 8)
    - **Property 8: Variety constraints**
    - Test teammate repetition threshold enforcement
    - Test matchup repetition constraint
    - Test fallback to lowest-max when all exceed threshold
    - **Validates: Requirements 4.3, 4.4, 4.5**

  - [x] 3.6 Write property tests for queue order mode (Property 9)
    - **Property 9: Queue order mode uses strict FIFO**
    - Test that in queue mode, positions 0-3 are always selected regardless of ratings
    - **Validates: Requirements 6.2**

- [x] 4. Checkpoint - Core services verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement match result service
  - [x] 5.1 Create `server/src/services/matchResultService.ts`
    - Implement `recordMatchResult(input: MatchResultInput)` — persists result, calls ratingService, updates pairing history
    - Implement `updateMatchResult(matchId, winningTeam)` — updates existing result, recalculates ratings
    - Implement `getMatchResult(matchId)` — retrieves single result
    - Implement `getSessionMatchResults(sessionId)` — retrieves all results for session
    - Implement `getPlayerStats(sessionId)` — computes PlayerStats[] with win rate, streak, star rating
    - Implement streak calculation (consecutive wins/losses from most recent matches)
    - _Requirements: 1.2, 1.5, 1.6, 5.1, 5.3_

  - [x] 5.2 Write property tests for match result round-trip (Property 1)
    - **Property 1: Match result round-trip persistence**
    - Test that recording and retrieving returns same winner/loser IDs and correct team mapping
    - **Validates: Requirements 1.2**

  - [x] 5.3 Write property tests for pairing history accuracy (Property 7)
    - **Property 7: Pairing history accuracy**
    - Test that teammate/opponent counts match actual match history
    - **Validates: Requirements 4.1, 4.2**

- [x] 6. Implement achievements service
  - [x] 6.1 Create `server/src/services/achievementsService.ts`
    - Implement `evaluateAchievements(sessionId, matchId)` — checks all achievement criteria after a match result
    - Implement "Iron Player" — most matches played (min 5), re-evaluates and may transfer
    - Implement "Undefeated" — all wins with 3+ matches
    - Implement "Hot Streak" — 5+ consecutive wins
    - Implement "Comeback King" — win after 2+ consecutive losses
    - Implement "Social Butterfly" — teammates with 6+ different players
    - Implement `getPlayerAchievements(sessionId, playerId)` — returns earned achievements
    - Implement `getSessionAchievements(sessionId)` — returns all achievements for session
    - Add repository functions for achievements storage (player_achievements table)
    - _Requirements: 12.1, 12.2, 12.3, 12.6_

  - [x] 6.2 Write unit tests for achievements service
    - Test each achievement criteria with specific scenarios
    - Test Iron Player transfer when another player surpasses match count
    - Test Comeback King triggers correctly after loss streak then win
    - _Requirements: 12.1, 12.2, 12.6_

- [x] 7. Modify court service for smart pairing integration
  - [x] 7.1 Update `courtService.startMatch` to use pairing service
    - Check session's pairing_mode before selecting players
    - If 'smart': use pairingService.selectPairing with candidate pool from queue
    - If 'queue': use existing FIFO logic (top 4 from queue)
    - Build PairingInput from queue, ratings, and pairing history
    - Remove selected players from queue and re-number positions
    - _Requirements: 3.1, 3.2, 3.8, 6.2, 6.3_

  - [x] 7.2 Update `courtService.completeMatch` to accept winning team
    - Modify to accept `{ winningTeam: 'team1' | 'team2' }` or `{ skip: true }` in request body
    - If winningTeam provided: call matchResultService.recordMatchResult, then evaluateAchievements
    - If skip: complete match without recording result (existing behavior)
    - If neither provided: throw ValidationError
    - Return players to queue in original assignment order
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 12.2_

- [x] 8. Implement new API endpoints
  - [x] 8.1 Add match result and stats endpoints to `app.ts`
    - PUT `/api/sessions/:sessionId/matches/:matchId/result` — update match result (validate session not ended)
    - GET `/api/sessions/:sessionId/stats` — return PlayerStats[] for session
    - PUT `/api/sessions/:sessionId/pairing-mode` — toggle pairing mode (validate session active)
    - GET `/api/sessions/:sessionId/leaderboard` — return LeaderboardEntry[] sorted by win rate
    - GET `/api/sessions/:sessionId/players/:playerId/history` — return match history for player
    - GET `/api/sessions/:sessionId/players/:playerId/head-to-head` — return head-to-head records
    - GET `/api/sessions/:sessionId/players/:playerId/profile` — return full player profile
    - GET `/api/sessions/:sessionId/achievements` — return all session achievements
    - _Requirements: 1.5, 5.1, 6.1, 7.1, 9.1, 10.1, 11.2, 12.3_

  - [x] 8.2 Modify existing endpoints for scoring integration
    - Update POST `/api/sessions/:sessionId/courts/:courtNumber/complete` to accept `{ winningTeam }` or `{ skip: true }` body
    - Update POST `/api/sessions/:sessionId/players` to accept optional `starRating` field (1-5)
    - Update GET `/api/sessions/:sessionId` to include pairing_mode, player stats, and achievements in response
    - Update GET `/api/sessions/:sessionId/live` to include player stats, star ratings, streaks, MVP badge, and achievements
    - Update POST `/api/sessions/:sessionId/end` to include leaderboard with achievements in summary
    - _Requirements: 1.1, 1.3, 5.1, 5.2, 5.5, 5.7, 7.1, 7.3, 8.1, 8.5, 12.5_

  - [x] 8.3 Write integration tests for new API endpoints
    - Test full match lifecycle: start → complete with score → verify ratings updated
    - Test pairing mode toggle and persistence
    - Test match result update flow
    - Test leaderboard generation on session end
    - Test match history and head-to-head endpoints
    - Test achievements awarded after match results
    - _Requirements: 1.2, 1.5, 2.2, 6.4, 7.1, 9.1, 10.1, 12.2_

- [x] 9. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement leaderboard and session summary
  - [x] 10.1 Create leaderboard generation logic
    - Implement sorting: Win_Rate descending → matches played descending → name alphabetical ascending
    - Include all players (even those with 0 matches)
    - Format win rate to one decimal place
    - Include star rating, final rating, wins, losses, matches played, achievements
    - Highlight MVP, Iron Player, and Undefeated players
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 12.5_

  - [x] 10.2 Write property tests for leaderboard sort (Property 10)
    - **Property 10: Leaderboard sort correctness**
    - Test that adjacent entries satisfy the sort invariant (win rate → matches → name)
    - **Validates: Requirements 7.1**

- [x] 11. Update client types and API functions
  - [x] 11.1 Update `client/src/types.ts` with new types
    - Add `PlayerStats`, `LeaderboardEntry`, `MatchResult`, `PairingMode`, `Achievement` types
    - Add `StarRating` type and display labels
    - Add `MatchHistoryEntry`, `HeadToHeadRecord`, `PlayerProfile` types
    - Update `SessionSummary` to include leaderboard and achievements
    - _Requirements: 5.1, 7.1, 8.1, 9.1, 10.1, 11.2, 12.1_

  - [x] 11.2 Update `client/src/api.ts` with new API functions
    - Add `completeMatchWithResult(sessionId, courtNumber, winningTeam)` function
    - Add `completeMatchSkipScore(sessionId, courtNumber)` function
    - Add `updateMatchResult(sessionId, matchId, winningTeam)` function
    - Add `getSessionStats(sessionId)` function
    - Add `setPairingMode(sessionId, mode)` function
    - Add `getLeaderboard(sessionId)` function
    - Add `getPlayerHistory(sessionId, playerId)` function
    - Add `getPlayerHeadToHead(sessionId, playerId)` function
    - Add `getPlayerProfile(sessionId, playerId)` function
    - Add `getSessionAchievements(sessionId)` function
    - Update `addPlayer` to accept optional `starRating` parameter
    - _Requirements: 1.1, 1.3, 1.5, 5.1, 6.1, 8.1, 9.1, 10.1, 11.2, 12.3_

- [x] 12. Implement frontend components - Match completion
  - [x] 12.1 Create `MatchCompleteDialog.tsx` component
    - Modal dialog shown when organizer clicks "Complete Match" on a court
    - Display team 1 (players 1 & 2) and team 2 (players 3 & 4) with player names
    - Buttons: "Team 1 Wins", "Team 2 Wins", "Skip Score"
    - Validation: show error if no selection made and form submitted
    - Call appropriate API function on selection
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 12.2 Create `PairingModeToggle.tsx` component
    - Toggle switch between "Smart Pairing" and "Queue Order"
    - Display current active mode
    - Call `setPairingMode` API on toggle
    - _Requirements: 6.1, 6.5_

- [x] 13. Implement frontend components - Statistics display
  - [x] 13.1 Create `PlayerStatsDisplay.tsx` component
    - Reusable component showing star rating (★ icons), numeric rating, wins, losses, win rate
    - Display streak indicator (🔥 3W or ❄️ 2L) when applicable
    - Display MVP badge when player is current MVP
    - Display achievement badges
    - Compact variant for queue list, expanded variant for court display
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 12.3_

  - [x] 13.2 Create `Leaderboard.tsx` component
    - Table showing ranked players with stats columns
    - Columns: Rank, Name, Star Rating, Rating, W, L, Matches, Win Rate, Achievements
    - Highlight MVP, Iron Player, Undefeated with special visual treatment
    - Show for both ended sessions and current standings
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 12.5_

  - [x] 13.3 Create `PlayerProfileCard.tsx` component
    - Modal overlay triggered by clicking/tapping a player name
    - Display: name, star rating, numeric rating, W/L/matches/win rate, streak
    - Display match history (most recent 10 matches) with court, teammates, opponents, result, timestamp
    - Display head-to-head records sorted by encounters descending
    - Display earned achievements
    - Dismiss via click outside, Escape key, or close button
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 13.4 Create `AchievementBadge.tsx` component
    - Display achievement icons/badges inline with player names
    - Show tooltip with achievement name on hover
    - Notification component for organizer when new achievement earned
    - _Requirements: 12.3, 12.4_

- [x] 14. Update existing frontend pages
  - [x] 14.1 Update `CheckInForm.tsx` for star rating input
    - Add star rating selector (1-5 stars) with labels (Beginner through Expert)
    - Default to 3 stars (Intermediate) if not selected
    - Pass starRating to addPlayer API call
    - _Requirements: 8.1, 8.3_

  - [x] 14.2 Update `QueueList.tsx` with player statistics
    - Display PlayerStatsDisplay (compact) next to each player name
    - Make player names clickable to open PlayerProfileCard
    - Show achievement badges inline
    - _Requirements: 5.5, 11.1, 12.3_

  - [x] 14.3 Update `CourtGrid.tsx` with match scoring UI
    - Replace simple "Complete" button with MatchCompleteDialog trigger
    - Show player stats on active court cards
    - Show head-to-head records between opposing team members on court card
    - _Requirements: 1.1, 5.5, 10.2_

  - [x] 14.4 Update `OrganizerDashboard.tsx` with new features
    - Add PairingModeToggle component
    - Show Leaderboard when session is ended
    - Show achievement notifications
    - Make player names clickable for PlayerProfileCard
    - _Requirements: 6.1, 7.5, 11.4, 12.4_

  - [x] 14.5 Update `LiveView.tsx` with statistics and leaderboard
    - Show PlayerStatsDisplay next to player names in queue and court displays
    - Show MVP badge on qualifying player
    - Show Leaderboard when session is ended
    - Make player names clickable for PlayerProfileCard
    - Show achievement badges
    - _Requirements: 5.1, 5.5, 5.7, 7.4, 11.1, 12.3_

- [x] 15. Checkpoint - Full feature integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Final wiring and polish
  - [x] 16.1 Wire achievement notifications into match completion flow
    - After match result recorded, check for new achievements
    - Display notification on organizer dashboard for newly earned achievements
    - Update player stats display to reflect new achievements immediately
    - _Requirements: 12.2, 12.4_

  - [x] 16.2 Update session end flow with full summary
    - Include leaderboard with achievements in session end response
    - Ensure all players (including 0-match players) appear in leaderboard
    - Highlight special achievements (MVP, Iron Player, Undefeated) in summary
    - _Requirements: 7.1, 7.3, 7.5, 12.5_

  - [x] 16.3 Write end-to-end integration tests
    - Test complete session flow: create → check-in with stars → start match → complete with score → verify stats → end session → verify leaderboard
    - Test pairing mode switch mid-session
    - Test achievement awarding across multiple matches
    - Test player profile card data accuracy
    - _Requirements: 1.2, 2.2, 5.4, 6.5, 7.1, 12.2_

- [x] 17. Final checkpoint - All features complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout (Express + better-sqlite3 backend, React + Vite frontend)
- The existing test suite (158 tests) must continue passing after each task
- `fast-check` is already installed for property-based testing

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 4, "tasks": ["5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2"] },
    { "id": 6, "tasks": ["7.1", "7.2"] },
    { "id": 7, "tasks": ["8.1", "8.2", "10.1"] },
    { "id": 8, "tasks": ["8.3", "10.2"] },
    { "id": 9, "tasks": ["11.1", "11.2"] },
    { "id": 10, "tasks": ["12.1", "12.2", "13.1", "13.2", "13.3", "13.4"] },
    { "id": 11, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 12, "tasks": ["16.1", "16.2"] },
    { "id": 13, "tasks": ["16.3"] }
  ]
}
```

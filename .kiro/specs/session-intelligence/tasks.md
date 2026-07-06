# Implementation Plan: Session Intelligence

## Overview

This plan implements four session analytics features — Matchup Diversity Score, Session Pace Dashboard, Next Game Countdown, and Match Quality Score — within the existing Express + SQLite monolith. Backend services are created first, then the API layer is extended, and finally the frontend components are updated. Property-based tests validate correctness properties throughout.

## Tasks

- [x] 1. Create database schema and core types
  - [x] 1.1 Create the `match_quality_scores` table and TypeScript interfaces
    - Add migration logic to create the `match_quality_scores` table in `server/src/db.ts`
    - Add `MatchQualityRow` interface and session intelligence types to `server/src/types.ts`
    - Add `SessionStateExtensions` interface with diversity, waitEstimates, paceMetrics, and qualityMetrics fields
    - _Requirements: 7.1, 7.5, 8.1_

- [x] 2. Implement Diversity Service
  - [x] 2.1 Create `server/src/services/diversityService.ts`
    - Implement `computeDiversityPercentage(sessionId, playerId)` using pairing_history table
    - Implement `computeSessionDiversity(sessionId)` returning Map<string, number>
    - Implement `calculateDiversityBonus(playerIds, sessionId)` returning 0.0–1.0
    - Handle edge cases: single player (return 0), zero Total_Possible_Opponents (skip formula)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 3.2_

  - [x] 2.2 Write property tests for diversity percentage bounds
    - **Property 1: Diversity percentage bounded 0-100**
    - **Validates: Requirements 1.1, 1.4, 1.6**
    - Generate random sessions with 1–30 players and varying match histories
    - Assert all computed percentages are integers in [0, 100]

  - [x] 2.3 Write property tests for diversity monotonicity
    - **Property 2: Diversity percentage monotonically non-decreasing with new unique opponents/teammates**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - Generate match sequences where each match adds a new unique opponent or teammate
    - Assert percentage never decreases after such matches

  - [x] 2.4 Write property tests for distinct counting
    - **Property 3: Diversity counts distinct players exactly once**
    - **Validates: Requirements 1.2, 1.3**
    - Generate scenarios where same opponent is faced N > 1 times
    - Assert opponent counted exactly once in unique opponent count

  - [x] 2.5 Write property test for dual-role counting
    - **Property 4: Player appears in both sets when both teammate and opponent**
    - **Validates: Requirements 1.7**
    - Generate scenarios where player B is A's teammate in one match and opponent in another
    - Assert B counted in both unique teammate and unique opponent sets for A

  - [x] 2.6 Write property test for new check-in behavior
    - **Property 5: New check-in resets to zero and adjusts totals**
    - **Validates: Requirements 1.4, 1.5**
    - Generate sessions, add a new player, assert their diversity is 0 and existing players' Total_Possible_Opponents increases by 1

  - [x] 2.7 Write property test for diversity bonus bounds
    - **Property 6: Diversity bonus bounded [0, 1]**
    - **Validates: Requirements 3.2**
    - Generate candidate groupings and assert bonus is in [0.0, 1.0]

- [x] 3. Implement Pace Service
  - [x] 3.1 Create `server/src/services/paceService.ts`
    - Implement `computePaceMetrics(sessionId)` returning PaceMetrics
    - Calculate Average_Match_Duration from completed matches (completedAt - startedAt)
    - Calculate Pacing_Projection using formula: `remaining_time / avgDuration × courtCount / ceil(totalPlayers / playersPerMatch)`
    - Handle edge cases: < 2 matches ("Not enough data yet"), zero remaining time (projection 0 + warning), zero players ("No players checked in")
    - Generate warning when projection < 6 games per player
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 3.2 Write property test for pacing projection formula
    - **Property 14: Pacing projection formula consistency**
    - **Validates: Requirements 4.2, 4.3**
    - Generate session timing scenarios with varying match counts, court counts, and player counts
    - Assert projection matches the specified formula

- [x] 4. Implement Queue Estimator Service
  - [x] 4.1 Create `server/src/services/queueEstimatorService.ts`
    - Implement `computeWaitEstimates(sessionId)` returning WaitEstimate[]
    - Use formula: `ceil(position / (courtCount × playersPerMatch)) × avgDuration` rounded to nearest minute, minimum 1
    - Return null for all players when < 2 matches completed or avgDuration is 0
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.2 Write property tests for wait estimate formula
    - **Property 8: Wait estimate formula consistency**
    - **Validates: Requirements 5.1, 5.4**
    - Generate queue states with varying positions, court counts, and avg durations
    - Assert computed wait equals expected formula result, minimum 1 minute

  - [x] 4.3 Write property test for wait estimate null conditions
    - **Property 9: Wait estimate null conditions**
    - **Validates: Requirements 5.2, 5.5**
    - Generate sessions with < 2 completed matches or zero avg duration
    - Assert all wait estimates are null

- [x] 5. Implement Quality Scorer Service
  - [x] 5.1 Create `server/src/services/qualityScorerService.ts`
    - Implement `computeMatchQuality(matchId, sessionId)` computing and persisting quality rating
    - Implement `getSessionQualityMetrics(sessionId)` for session aggregate
    - Score_Closeness_Score = max(0, 100 - |T1 - T2| × 10)
    - Rating_Balance_Score = max(0, 100 - ratingGap)
    - Freshness_Score = 100 if fresh matchup, 50 if repeated
    - Match_Quality_Rating = closeness × 0.40 + balance × 0.35 + freshness × 0.25 (clamped 0–100)
    - Handle no-scores case: balance × 0.60 + freshness × 0.40
    - Session_Quality_Score = arithmetic mean of all Match_Quality_Rating values
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.7_

  - [x] 5.2 Write property test for match quality rating bounds
    - **Property 10: Match quality rating bounded 0-100**
    - **Validates: Requirements 7.1, 7.5**
    - Generate match scores and ratings, assert rating is integer in [0, 100]

  - [x] 5.3 Write property test for score closeness formula
    - **Property 11: Score closeness formula correctness**
    - **Validates: Requirements 7.2**
    - Generate team scores, assert closeness equals max(0, 100 - |T1-T2| × 10)

  - [x] 5.4 Write property test for no-scores reduced formula
    - **Property 12: Match quality without scores uses reduced formula**
    - **Validates: Requirements 7.6**
    - Generate matches without scores, assert rating uses only balance (60%) + freshness (40%)

  - [x] 5.5 Write property test for session quality aggregation
    - **Property 13: Session quality score is arithmetic mean**
    - **Validates: Requirements 8.1**
    - Generate sessions with N rated matches, assert session score equals mean of ratings

- [x] 6. Checkpoint - Core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate diversity bonus into pairing service
  - [x] 7.1 Modify `server/src/services/pairingService.ts` to include diversity bonus
    - Add `diversityBonus` field to `TeamCombination` interface
    - Call `calculateDiversityBonus` for each candidate grouping
    - Insert diversity bonus (descending) as tiebreaker between skill gap and teammate frequency sum
    - Skip diversity bonus when pairing mode is "queue" (not "smart")
    - Skip when all candidates have bonus 0.0 (fall through to next tiebreaker)
    - Ensure existing filters (teammate repetition threshold, exact matchup repetition) remain before diversity bonus
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 7.2 Write property test for diversity bonus tiebreaker priority
    - **Property 7: Diversity bonus as correct tiebreaker priority**
    - **Validates: Requirements 3.1, 3.3**
    - Generate candidate pools with equal skill gap, assert higher diversity bonus wins; when bonuses equal, fall through to teammate frequency sum

- [x] 8. Extend API session state endpoint
  - [x] 8.1 Extend `GET /api/sessions/:id/state` response with session intelligence data
    - Add `diversity` field: call `computeSessionDiversity` for all checked-in players
    - Add `waitEstimates` field: call `computeWaitEstimates` for queued players
    - Add `paceMetrics` field: call `computePaceMetrics`
    - Add `qualityMetrics` field: call `getSessionQualityMetrics`
    - _Requirements: 1.1, 2.1, 2.6, 4.6, 5.3, 6.4, 8.8_

  - [x] 8.2 Hook quality scoring into match completion flow
    - In `POST /api/sessions/:id/courts/:courtNumber/complete`, call `computeMatchQuality` after match is completed
    - Persist quality score to `match_quality_scores` table
    - _Requirements: 7.1, 8.8_

- [x] 9. Checkpoint - Backend integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update frontend components
  - [x] 10.1 Update `PlayerProfileCard` to display diversity percentage
    - Display "Diversity: X%" from session state diversity data
    - Apply amber color when below 50%, green when 50% or above
    - Display "Diversity: 0%" when player has zero matches
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 10.2 Update `QueueList` to display diversity and wait estimates
    - Display "X%" next to each queued player's name from diversity data
    - Display "You're up in ~N min" or "You're up next!" from waitEstimates data
    - Hide countdown when estimate is null
    - Show "You're up next!" when estimate < 2 minutes
    - _Requirements: 2.2, 6.1, 6.2, 6.3_

  - [x] 10.3 Update `OrganizerDashboard` with pace and quality cards
    - Add "Session Pace" card: display avg match duration, pacing projection, and warnings
    - Display "Not enough data yet" when < 2 matches completed
    - Display warning when projection < 6 games per player
    - Add "Session Quality" card: display "Session Quality: X/100" with color indicators
    - Display green ≥ 70, amber 40–69, red < 40
    - Show up to 3 most recent match quality ratings (court number + score)
    - Display "N/A" when no matches are rated
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.7, 4.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.7_

  - [x] 10.4 Update `LiveView` to display wait estimates for queued players
    - Display estimated wait time next to each queued player using same format as QueueList
    - _Requirements: 6.4_

  - [x] 10.5 Write unit tests for frontend session intelligence components
    - Test PlayerProfileCard renders correct color for diversity thresholds (amber < 50%, green ≥ 50%)
    - Test QueueList shows "You're up in ~N min" and "You're up next!" at correct breakpoints
    - Test OrganizerDashboard displays pace warnings when projection < 6
    - Test session quality color indicators match score thresholds
    - _Requirements: 2.4, 2.5, 6.1, 6.2, 4.5, 8.2, 8.3, 8.4_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All backend services use the existing SQLite database via better-sqlite3
- Frontend components use the established polling pattern on `GET /api/sessions/:id/state`
- fast-check is already available in both server and client workspaces

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "3.2", "4.2", "4.3", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 3, "tasks": ["7.1"] },
    { "id": 4, "tasks": ["7.2", "8.1", "8.2"] },
    { "id": 5, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 6, "tasks": ["10.5"] }
  ]
}
```

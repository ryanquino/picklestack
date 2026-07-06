# Implementation Plan: Session Settings & On Deck Queue

## Overview

This plan implements three upgrades to the Picklestack app: (1) a session settings modal with expanded configuration options (session type, game mode, matching mode, court name), (2) numeric score input with score margin multiplier on the existing Elo-like rating system, and (3) an On Deck queue display showing which players are next to play. Implementation proceeds bottom-up: database schema → server types → service modifications → API routes → frontend components.

The existing rating system (Elo-like, base 16 points, range 100-3000) is preserved. The score margin adds a multiplier: `min(1 + margin/20, 2.0)`.

## Tasks

- [x] 1. Database schema and server types
  - [x] 1.1 Update database schema in `server/src/db.ts`
    - Add `court_name TEXT DEFAULT ''` to sessions table
    - Add `session_type TEXT NOT NULL DEFAULT 'open_play'` to sessions table
    - Add `game_mode TEXT NOT NULL DEFAULT 'doubles'` to sessions table
    - Add `matching_mode TEXT NOT NULL DEFAULT 'smart'` to sessions table
    - Add `team1_score INTEGER DEFAULT NULL` to match_results table
    - Add `team2_score INTEGER DEFAULT NULL` to match_results table
    - Note: existing `pairing_mode` column is kept for backward compatibility
    - _Requirements: 1.2, 1.4, 3.6_

  - [x] 1.2 Update `server/src/types.ts` with new types
    - Add `SessionType = 'tournament' | 'open_play'` type alias
    - Add `GameMode = 'doubles' | 'singles'` type alias
    - Add `MatchingMode = 'queue' | 'smart' | 'tournament' | 'skill_courts'` type alias
    - Add `SessionSettings` interface (name, courtCount, courtName, sessionType, gameMode, matchingMode)
    - Add `MatchResultWithScore` interface extending `MatchResult` with `team1Score` and `team2Score`
    - Update `Session` interface to include `sessionType`, `gameMode`, `matchingMode`, `courtName`
    - _Requirements: 1.2, 1.8, 3.6_

  - [x] 1.3 Update `server/src/repository.ts` with new row types and queries
    - Update `SessionRow` interface to include `court_name`, `session_type`, `game_mode`, `matching_mode`
    - Update `MatchResultRow` interface to include `team1_score`, `team2_score`
    - Add `updateSessionSettings(sessionId, settings)` repository function
    - Add `getSessionSettings(sessionId)` repository function
    - Update `createMatchResult` to persist score columns
    - _Requirements: 1.4, 3.6_

- [x] 2. Modify rating service for score margin multiplier
  - [x] 2.1 Modify `server/src/services/ratingService.ts` to accept optional `scoreMargin`
    - Add optional `scoreMargin?: number` parameter to `calculateRatingAdjustment`
    - Implement margin multiplier: `min(1 + scoreMargin / 20, 2.0)` (defaults to 1.0 when undefined)
    - Multiply the existing adjustment by the margin multiplier before rounding
    - Export new pure function `calculateMarginMultiplier(scoreMargin: number): number`
    - Modify `applyMatchResult` to accept optional `scoreMargin` parameter and pass it through
    - _Requirements: 3.9_

  - [ ] 2.2 Write property test: Score margin rating adjustment (Property 7)
    - **Property 7: Score margin rating adjustment**
    - Generate arbitrary valid team ratings and score margins (non-negative integers)
    - Assert marginMultiplier = `min(1 + margin / 20, 2.0)`
    - Assert adjustment = `round(BASE_POINTS * scaleFactor * marginMultiplier)`
    - Assert adjustment is always between 8 and 48 inclusive
    - **Validates: Requirements 3.9**

- [x] 3. Modify match result service for scores
  - [x] 3.1 Update `server/src/services/matchResultService.ts` to accept and persist scores
    - Modify `MatchResultInput` interface to include optional `team1Score?: number` and `team2Score?: number`
    - Add `validateScores` pure function: both non-negative integers, not equal
    - Derive winning team from scores when both are provided (higher score wins)
    - Calculate `scoreMargin = Math.abs(team1Score - team2Score)` when scores provided
    - Pass `scoreMargin` to `applyMatchResult` in rating service
    - Persist `team1_score` and `team2_score` in match_results row
    - Export `formatMatchScore(team1Score, team2Score)` pure function returning "11-7" or "No Score"
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ] 3.2 Write property test: Score validation and winner derivation (Property 4 & 5)
    - **Property 4: Winner determination from scores**
    - **Property 5: Score validation**
    - Generate arbitrary integer pairs; assert acceptance iff both ≥ 0 and not equal
    - Assert winning team derived correctly from higher score
    - Assert equal scores are rejected with error message
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [ ] 3.3 Write property test: Score persistence round-trip (Property 6)
    - **Property 6: Score persistence round-trip**
    - Generate valid score pairs, record match result with scores, retrieve and assert scores match
    - Assert winner/loser player IDs are correct based on score comparison
    - **Validates: Requirements 3.6**

- [~] 4. Checkpoint - Ensure rating and match result tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Modify session service and court service
  - [x] 5.1 Update `server/src/services/sessionService.ts` with settings management
    - Add `validateSessionSettings` pure function (name 1-50 chars trimmed, courtCount integer 1-12, courtName 0-50 chars, valid enum values for sessionType/gameMode/matchingMode)
    - Add `updateSessionSettings(sessionId, settings)` function with validation
    - Add `getSessionSettings(sessionId)` function
    - Validate session is active before allowing updates (throw 403 for ended sessions)
    - Update `createSession` to include new default columns in the row
    - Update `toSession` to map new columns to domain object
    - _Requirements: 1.4, 1.5, 1.6, 1.7_

  - [ ] 5.2 Write property test: Session settings validation (Property 2)
    - **Property 2: Session settings validation correctness**
    - Generate arbitrary strings and numbers; assert validation accepts iff name.trim().length 1-50, courtCount integer 1-12, courtName length 0-50
    - **Validates: Requirements 1.5**

  - [ ] 5.3 Write property test: Session settings round-trip persistence (Property 1)
    - **Property 1: Session settings persistence round-trip**
    - Generate valid settings, persist via updateSessionSettings, retrieve via getSessionSettings, assert all fields match
    - **Validates: Requirements 1.4**

  - [x] 5.4 Modify `server/src/services/courtService.ts` for singles mode
    - Read session's `game_mode` from DB to determine players per match (2 for singles, 4 for doubles)
    - Update queue minimum check: 2 for singles, 4 for doubles
    - Update player selection logic to pick 2 or 4 players
    - Update `buildCandidatePool` pool size for singles (min(N, 4) instead of 8)
    - Update `completeMatch` options to accept `team1Score` and `team2Score`, pass to `recordMatchResult`
    - Handle 1-player teams in singles mode for pairing history
    - _Requirements: 1.8, 3.1_

  - [ ] 5.5 Write property test: Singles mode player count (Property 3)
    - **Property 3: Singles mode player count**
    - Generate sessions with game_mode 'singles' (queue ≥ 2) and 'doubles' (queue ≥ 4)
    - Assert match assigns exactly 2 or 4 players respectively
    - **Validates: Requirements 1.8**

- [x] 6. Create On Deck pure function
  - [x] 6.1 Create `server/src/onDeck.ts` with `getOnDeckPlayerIds` pure function
    - Implement logic: queue mode + doubles → first 4; queue mode + singles → first 2; smart pairing → first min(N, 8); tournament/skill_courts → first 4 (doubles) or 2 (singles)
    - When queue has fewer players than needed, return all players
    - Return player IDs as string array
    - _Requirements: 4.2, 4.6, 4.8_

  - [ ] 6.2 Write property test: On Deck calculation correctness (Property 8)
    - **Property 8: On Deck calculation correctness**
    - Generate arbitrary queue lengths (0-50), game modes, and matching modes
    - Assert correct count: smart → min(N, 8), non-smart doubles → min(N, 4), non-smart singles → min(N, 2)
    - Assert result is always a prefix of the queue ordered by position
    - **Validates: Requirements 4.2, 4.4, 4.5, 4.6, 4.8**

- [~] 7. Checkpoint - Ensure all server tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update API routes
  - [x] 8.1 Add session settings endpoints and modify match completion in `server/src/app.ts`
    - Add `PUT /api/sessions/:sessionId/settings` route calling `updateSessionSettings`
    - Add `GET /api/sessions/:sessionId/settings` route calling `getSessionSettings`
    - Modify `POST /api/sessions/:sessionId/courts/:courtNumber/complete` to accept `{ team1Score, team2Score }` or `{ skip: true }`
    - Update `GET /api/sessions/:sessionId` response to include new session fields (sessionType, gameMode, matchingMode, courtName)
    - Update `GET /api/sessions/:sessionId/live` response to include On Deck player IDs using `getOnDeckPlayerIds`
    - _Requirements: 1.4, 1.7, 3.1, 4.1_

  - [x] 8.2 Update existing server tests for modified behavior
    - Update `server/src/services/ratingService.test.ts` to cover score margin multiplier
    - Update `server/src/services/matchResultService.test.ts` for score handling (validation, persistence, winner derivation)
    - Update `server/src/services/courtService.test.ts` for singles mode (2 players per match, queue minimum)
    - Add `server/src/services/sessionService.test.ts` tests for settings validation, persistence, ended session rejection
    - Add `server/src/onDeck.test.ts` unit tests for On Deck logic
    - Update `server/src/app.test.ts` integration tests for new/modified endpoints
    - _Requirements: 1.4, 1.5, 1.8, 3.1, 3.2, 3.3, 3.6, 3.9, 4.2_

- [~] 9. Checkpoint - Ensure all server tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Frontend: Update client types and API
  - [x] 10.1 Update `client/src/types.ts` with new types
    - Add `SessionType`, `GameMode`, `MatchingMode` type aliases
    - Add `SessionSettings` interface
    - Update `Session` interface with new fields (sessionType, gameMode, matchingMode, courtName)
    - _Requirements: 1.2, 1.8_

  - [x] 10.2 Update `client/src/api.ts` with new API calls
    - Add `updateSessionSettings(sessionId, settings)` function calling `PUT /api/sessions/:sessionId/settings`
    - Add `getSessionSettings(sessionId)` function calling `GET /api/sessions/:sessionId/settings`
    - Modify `completeMatchWithResult` to accept optional `team1Score` and `team2Score` parameters
    - _Requirements: 1.4, 3.1_

- [x] 11. Frontend: New components
  - [x] 11.1 Create `client/src/components/SessionSettingsModal.tsx`
    - Modal with form fields: session name (pre-filled), court name (optional, 0-50 chars), session type dropdown ("Tournament"/"Open Play"), court count (pre-filled, editable 1-12), game mode dropdown ("Doubles"/"Singles"), matching mode dropdown ("Queue"/"Smart Pairing"/"Tournament"/"Skill Courts")
    - Default values: session type "Open Play", game mode "Doubles", matching mode "Smart Pairing"
    - Include player check-in section (name + optional star rating) with list of checked-in players
    - Inline validation for all fields
    - On confirm: call `updateSessionSettings` API, then invoke `onConfirm` callback
    - `onClose` prop is undefined when shown post-creation (no close allowed)
    - Accessible: focus trap, aria labels, keyboard navigation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4_

  - [x] 11.2 Create `client/src/components/OnDeckQueue.tsx`
    - Accept `queue`, `gameMode`, and `matchingMode` props
    - Compute On Deck player IDs using same logic as server `getOnDeckPlayerIds`
    - Display "On Deck" badge/label next to each On Deck player
    - Visually distinguish On Deck players with highlighted background
    - Show "More players needed" message when queue has fewer than required players
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 4.8_

- [x] 12. Frontend: Modify existing components
  - [x] 12.1 Modify `client/src/pages/CreateSession.tsx` to open settings modal
    - After successful session creation, instead of navigating to `/session/:id`, show `SessionSettingsModal` with the new session ID
    - Pass session name and court count as initial values to the modal
    - On modal confirm, navigate to `/session/:id`
    - _Requirements: 1.1_

  - [x] 12.2 Modify `client/src/components/MatchCompleteDialog.tsx` for numeric score input
    - Replace team selection buttons with two numeric score inputs (Team 1 Score, Team 2 Score)
    - Show team player names next to each score input
    - Validate: both non-negative integers, not equal
    - Derive and display winning team indicator based on higher score
    - Keep "Skip Score" option
    - On submit: call modified `completeMatchWithResult` with scores
    - Display validation errors inline (tied scores, negative values)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 12.3 Modify `client/src/pages/OrganizerDashboard.tsx` for settings and On Deck
    - Add settings button to open `SessionSettingsModal` for editing mid-session
    - Integrate `OnDeckQueue` component to show On Deck indicators
    - Update queue display to show On Deck badges
    - _Requirements: 1.7, 4.1, 4.3, 4.4, 4.5_

  - [x] 12.4 Modify `client/src/pages/LiveView.tsx` for On Deck display
    - Integrate `OnDeckQueue` component or On Deck logic into queue section
    - Mark On Deck players with highlighted badge
    - Show "More players needed" message when applicable
    - Display match scores in active match cards (when available from API)
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.7_

  - [x] 12.5 Modify `client/src/components/QueueList.tsx` for On Deck indicators
    - Accept `gameMode` and `matchingMode` props
    - Compute On Deck set and display "On Deck" text badge next to qualifying players
    - Visually distinguish On Deck players with highlighted background or border
    - _Requirements: 4.3, 4.7_

  - [x] 12.6 Update match history display for scores
    - Display "11-7" format scores in match history entries (winner score first)
    - Display "No Score" for skipped matches
    - Update `PlayerProfileCard` and `LiveView` match history sections
    - _Requirements: 3.7, 3.8_

- [~] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing rating system (Elo-like, base 16, range 100-3000) is preserved — only the score margin multiplier is added
- Database schema changes require deleting the existing `picklestack.db` file since SQLite ALTER TABLE is limited and the app recreates tables on first run
- The `pairing_mode` column is kept for backward compatibility; `matching_mode` extends it with additional options
- The existing 281 tests should continue passing with minimal updates (no rating system rewrite)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["2.1", "5.1", "6.1"] },
    { "id": 3, "tasks": ["2.2", "5.2", "5.3", "6.2"] },
    { "id": 4, "tasks": ["3.1", "5.4"] },
    { "id": 5, "tasks": ["3.2", "3.3", "5.5"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2"] },
    { "id": 8, "tasks": ["10.1", "10.2"] },
    { "id": 9, "tasks": ["11.1", "11.2"] },
    { "id": 10, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6"] }
  ]
}
```

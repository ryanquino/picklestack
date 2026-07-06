# Implementation Plan: Pickleball Queue System

## Overview

This plan implements the Picklestack web application for managing pickleball open play sessions. The implementation follows a backend-first approach: set up the project structure, implement the data layer and service logic, build the REST API, then create the React frontend. Property-based tests validate correctness properties from the design, and integration wiring connects all components.

## Tasks

- [x] 1. Set up project structure and shared configuration
  - [x] 1.1 Initialize monorepo with backend and frontend packages
    - Create root `package.json` with workspaces for `server/` and `client/`
    - Initialize `server/` with TypeScript, Express, and SQLite dependencies
    - Initialize `client/` with Vite + React + TypeScript
    - Configure shared TypeScript settings and path aliases
    - Add `fast-check` and `vitest` as dev dependencies in `server/`
    - _Requirements: 1.1, 6.3_

  - [x] 1.2 Define shared TypeScript interfaces and types
    - Create `server/src/types.ts` with `Session`, `Player`, `QueueEntry`, `Court`, `Match`, and `SessionSummary` interfaces as defined in the design
    - Create `client/src/types.ts` mirroring the API response types
    - _Requirements: 1.1, 2.1, 3.1, 4.2, 5.1, 6.1_

- [x] 2. Implement database layer
  - [x] 2.1 Create database initialization and schema
    - Create `server/src/db.ts` with SQLite connection setup
    - Implement schema creation (sessions, players, queue_entries, matches tables) with the unique index on active courts
    - Implement a `getDb()` function that initializes the database on first call
    - _Requirements: 7.1, 7.2_

  - [x] 2.2 Create database repository functions
    - Implement CRUD operations for sessions, players, queue entries, and matches
    - Implement `findPlayerByNameCaseInsensitive` for duplicate detection
    - Implement `getQueueBySession` returning ordered entries
    - Implement `getActiveMatchByCourt` for court status checks
    - _Requirements: 2.3, 3.1, 4.5, 7.1_

- [x] 3. Implement SessionService
  - [x] 3.1 Implement session creation with validation
    - Create `server/src/services/sessionService.ts`
    - Implement `createSession(name, courtCount)` with input validation (name 1-50 trimmed chars, courtCount 1-12 integer)
    - Generate UUID for session ID and unique live view URL
    - Persist session to database and return created session (session must be persisted even if subsequent dashboard display fails on the client)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 3.2 Write property test for session creation validation (Property 1)
    - **Property 1: Session creation validation partitions inputs correctly**
    - Generate random strings and numbers with fast-check, verify validation accepts iff name.trim() is 1-50 chars AND courtCount is whole number 1-12
    - **Validates: Requirements 1.1, 1.2, 1.4**

  - [ ]* 3.3 Write property test for unique URL generation (Property 2)
    - **Property 2: Session creation produces unique URLs**
    - Create multiple sessions with valid inputs, verify all live view URLs are distinct
    - **Validates: Requirements 1.3**

  - [x] 3.4 Implement getSession and endSession
    - Implement `getSession(sessionId)` returning full session state or null
    - Implement `endSession(sessionId)` that marks session complete, clears queue, force-completes active matches, and returns summary with total players and matches
    - _Requirements: 7.2, 8.1, 8.3, 8.5_

  - [ ]* 3.5 Write property tests for session end (Properties 14, 15)
    - **Property 14: Session end clears queue and rejects new check-ins**
    - **Property 15: Session summary counts are accurate**
    - Generate active sessions, end them, verify queue is empty and check-ins rejected; verify summary counts match actual players/matches
    - **Validates: Requirements 8.1, 8.3, 8.5**

- [x] 4. Implement QueueService
  - [x] 4.1 Implement player check-in with validation
    - Create `server/src/services/queueService.ts`
    - Implement `addPlayer(sessionId, playerName)` with name validation (1-30 chars, at least 1 non-whitespace) and case-insensitive duplicate detection
    - Append player to end of queue with correct position
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 4.2 Write property tests for player check-in (Properties 3, 4, 5)
    - **Property 3: Player name validation partitions inputs correctly**
    - **Property 4: Player check-in appends to queue end**
    - **Property 5: Duplicate player name detection is case-insensitive**
    - Generate random strings for name validation; generate queues and verify append position; generate case variations and verify rejection
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**

  - [x] 4.3 Implement queue move and remove operations
    - Implement `movePlayer(sessionId, playerId, direction)` that swaps adjacent positions, no-op at boundaries
    - Implement `removePlayer(sessionId, playerId)` that removes from queue or active match and re-numbers positions from 0
    - Implement `getQueue(sessionId)` returning ordered queue entries
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 4.4 Write property tests for queue operations (Properties 6, 7)
    - **Property 6: Queue positions are sequential from zero after any operation**
    - **Property 7: Queue move preserves all players without duplication**
    - Generate random operation sequences and verify positions are 0..N-1; generate queues and moves, verify same player set preserved
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 5. Checkpoint - Backend services core logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement CourtService
  - [x] 6.1 Implement match start logic
    - Create `server/src/services/courtService.ts`
    - Implement `startMatch(sessionId, courtNumber)` that validates court is available and queue has 4+ players, assigns top 4 from queue, sets court active, re-numbers remaining queue
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 6.2 Write property tests for match start (Properties 8, 9)
    - **Property 8: Match start assigns top 4 from queue and updates state**
    - **Property 9: Match startable only when queue has 4+ players and court is available**
    - Generate queues with 4+ players and available courts, verify assignment and state; generate random states, verify startable indicator
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [x] 6.3 Implement match completion logic
    - Implement `completeMatch(sessionId, courtNumber)` that validates active match exists, returns non-removed players to queue end in assignment order, sets court available
    - If no active match exists on the court, return error and explicitly preserve all current state (match and court status remain unchanged)
    - Implement `getCourts(sessionId)` returning all courts with status
    - _Requirements: 3.6, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.4 Write property tests for match completion (Properties 10, 11)
    - **Property 10: Match completion returns players to queue end in assignment order**
    - **Property 11: Removed players are excluded from match completion rotation**
    - Generate sessions with active matches, complete them, verify return order; generate matches with removed players, verify exclusion
    - **Validates: Requirements 3.6, 5.1, 5.2, 5.5**

- [x] 7. Implement REST API routes
  - [x] 7.1 Create Express app with session and player routes
    - Create `server/src/app.ts` with Express setup, JSON body parsing, CORS
    - Implement `POST /api/sessions` — create session
    - Implement `GET /api/sessions/:sessionId` — get full session state for organizer
    - Implement `GET /api/sessions/:sessionId/live` — get session state for live view
    - Implement `POST /api/sessions/:sessionId/players` — check in player
    - Implement `DELETE /api/sessions/:sessionId/players/:playerId` — remove player
    - Map service errors to appropriate HTTP status codes (400, 403, 404, 409, 422, 500)
    - _Requirements: 1.1, 1.4, 2.1, 2.3, 2.5, 3.4, 3.5, 6.1, 6.3, 6.5, 7.4_

  - [x] 7.2 Create queue and court routes
    - Implement `PUT /api/sessions/:sessionId/queue/move` — move player in queue
    - Implement `POST /api/sessions/:sessionId/courts/:courtNumber/start` — start match
    - Implement `POST /api/sessions/:sessionId/courts/:courtNumber/complete` — complete match
    - Implement `POST /api/sessions/:sessionId/end` — end session
    - _Requirements: 3.2, 3.3, 4.2, 4.6, 5.1, 5.4, 8.1, 8.2_

  - [x] 7.3 Create server entry point
    - Create `server/src/index.ts` with server startup on configurable port
    - Serve static client build files in production
    - _Requirements: 6.3, 7.4_

- [x] 8. Checkpoint - Backend API complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement frontend - Session creation and organizer dashboard
  - [x] 9.1 Set up React app with routing
    - Configure React Router with routes for `/` (create session), `/session/:sessionId` (organizer dashboard), `/live/:sessionId` (live view), and 404 page
    - Create API client utility for backend communication
    - _Requirements: 1.1, 6.1, 6.5_

  - [x] 9.2 Implement Create Session page
    - Build form with session name and court count inputs
    - Implement client-side validation matching backend rules (name 1-50 trimmed, courts 1-12)
    - Display inline validation errors, preserve form state on error
    - On success, navigate to organizer dashboard
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 9.3 Implement Organizer Dashboard - Check-in and Queue
    - Build `CheckInForm` component with player name input, duplicate/validation error display
    - Build `QueueList` component showing ordered players with position, move up/down buttons, and remove button
    - Disable move-up on first player, move-down on last player
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 9.4 Implement Organizer Dashboard - Courts and Match Controls
    - Build `CourtGrid` component showing all courts with status
    - Build `CourtCard` component displaying assigned players for active courts, "Start Match" button for available courts
    - Disable "Start Match" when queue has fewer than 4 players
    - Add "Complete Match" button on active courts
    - Display shareable live view URL with copy button
    - Add "End Session" button with confirmation dialog
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 8.1, 8.2_

- [x] 10. Implement frontend - Live View
  - [x] 10.1 Implement Live View page with polling
    - Build `LiveView` component that polls `GET /api/sessions/:sessionId/live` every 3 seconds
    - Display queue with positions and names
    - Highlight first 4 players as "up next"
    - Display active courts with assigned player names
    - Display "Session not found" for invalid session IDs
    - Display "Session ended" message with summary for ended sessions
    - No login or authentication required
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 8.4_

- [x] 11. Implement state persistence and error handling
  - [x] 11.1 Implement persistence guarantees and error recovery
    - Ensure all state-changing API endpoints persist to SQLite before responding (satisfies <2s persistence requirement given synchronous writes)
    - Implement session restoration on organizer dashboard load via `GET /api/sessions/:sessionId` (only restore if within 24 hours of last state change; do not restore after 24 hours regardless of browser state)
    - Handle corrupted/unreadable state: display error with "start new session" option (only show restoration errors for corruption, unreadable, or restoration failure conditions)
    - Display session summary on organizer dashboard when session is ended
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.3, 8.4_

  - [ ]* 11.2 Write property test for state persistence round trip (Property 13)
    - **Property 13: Session state persistence round trip**
    - Generate random valid session states, persist to database, restore, verify equivalence
    - **Validates: Requirements 7.2**

  - [ ]* 11.3 Write property test for live view completeness (Property 12)
    - **Property 12: Live view response contains complete session state**
    - Generate random session states, call live view endpoint, verify response includes all queued players with positions, all active courts with players, and correct "up next" marking
    - **Validates: Requirements 6.1**

- [x] 12. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design using fast-check
- Unit tests validate specific examples and edge cases
- The backend is implemented first so the frontend can be developed against a working API
- SQLite synchronous writes satisfy the <2 second persistence requirement without additional complexity

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["3.1", "4.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "4.2", "4.3"] },
    { "id": 5, "tasks": ["3.5", "4.4"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4", "7.1"] },
    { "id": 9, "tasks": ["7.2", "7.3"] },
    { "id": 10, "tasks": ["9.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 12, "tasks": ["9.4", "11.1"] },
    { "id": 13, "tasks": ["11.2", "11.3"] }
  ]
}
```

# Implementation Plan: Fixed Team Pairing

## Overview

This plan implements the Fixed Team Pairing feature, which allows organizers to lock two players as permanent teammates for a session. The implementation proceeds bottom-up: data layer first, then service logic, then API routes, and finally client UI. Each step builds on the previous, ensuring no orphaned code.

## Tasks

- [x] 1. Data layer: Create fixed_pairs table and repository functions
  - [x] 1.1 Add fixed_pairs table schema and pair_id column to queue_entries
    - Add `CREATE TABLE IF NOT EXISTS fixed_pairs` to the SCHEMA constant in `server/src/db.ts`
    - Add indexes: `idx_fixed_pairs_session`, unique indexes on `(session_id, player1_id)` and `(session_id, player2_id)`
    - Add `ALTER TABLE queue_entries ADD COLUMN pair_id TEXT REFERENCES fixed_pairs(id)` migration logic or include `pair_id` in the queue_entries CREATE TABLE statement
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Implement repository functions for fixed_pairs CRUD
    - Add `FixedPairRow` interface to `server/src/repository.ts`
    - Implement `createFixedPair(pair: FixedPairRow): FixedPairRow`
    - Implement `getFixedPairById(id: string): FixedPairRow | undefined`
    - Implement `getFixedPairsBySession(sessionId: string): FixedPairRow[]`
    - Implement `getFixedPairByPlayerId(sessionId: string, playerId: string): FixedPairRow | undefined`
    - Implement `deleteFixedPair(id: string): void`
    - Implement `deleteFixedPairsBySession(sessionId: string): void`
    - Add `getQueueEntryByPairId(pairId: string)` to retrieve queue entries by pair_id
    - Update `createQueueEntry` to accept optional `pair_id` parameter
    - _Requirements: 1.1, 4.1, 4.4_

  - [x] 1.3 Write unit tests for fixed_pairs repository functions
    - Test createFixedPair inserts and returns the row
    - Test getFixedPairByPlayerId returns correct pair for either player
    - Test deleteFixedPair removes the record
    - Test deleteFixedPairsBySession removes all pairs in a session
    - Test unique index prevents duplicate player pairings
    - _Requirements: 1.1, 5.1_

- [x] 2. Service layer: Implement fixedPairService
  - [x] 2.1 Create `server/src/services/fixedPairService.ts` with createFixedPair function
    - Implement `createFixedPair(sessionId, player1Id, player2Id): FixedPair`
    - Validate: session is active (Req 1.6), both players in session (Req 5.2), both in queue (not in active match, Req 1.5), neither already paired (Req 1.4)
    - Remove both individual queue entries
    - Insert single pair slot at `min(position1, position2)` with `pair_id` set
    - Re-number all queue positions from 0
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 5.2_

  - [x] 2.2 Implement dissolveFixedPair function in fixedPairService
    - Implement `dissolveFixedPair(sessionId, pairId): void`
    - Validate: pair exists, neither player in active match (Req 4.3)
    - Remove pair slot from queue
    - Insert two individual queue entries at consecutive positions starting at original pair slot position
    - Re-number queue positions from 0
    - Delete the fixed_pairs record
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.3 Implement dissolveAllPairs and helper functions in fixedPairService
    - Implement `dissolveAllPairs(sessionId): void` — dissolves all pairs in a session (called on session end)
    - Implement `getFixedPairsBySession(sessionId): FixedPair[]`
    - Implement `getFixedPairByPlayerId(sessionId, playerId): FixedPair | undefined`
    - Implement `calculateCombinedRating(player1Rating, player2Rating): number`
    - _Requirements: 4.4, 3.3_

  - [x] 2.4 Write property tests for fixedPairService queue operations
    - **Property 1: Queue position contiguity invariant**
    - **Property 2: Pair creation queue transformation**
    - **Property 3: One pair per player constraint**
    - **Validates: Requirements 1.2, 1.3, 1.4, 4.2, 5.1**

  - [x] 2.5 Write property tests for fixedPairService validation and dissolve
    - **Property 4: Active match prevents pair creation**
    - **Property 13: Dissolve pair expands to two individual entries**
    - **Property 14: Cannot dissolve pair during active match**
    - **Property 15: Both players must be in session for pair creation**
    - **Validates: Requirements 1.5, 4.1, 4.3, 5.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Queue service: Extend for pair awareness
  - [x] 4.1 Modify `getQueue` in queueService to return pair information
    - Extend `QueueEntryWithName` interface with `isPairSlot`, `pairId`, `partnerPlayerId`, `partnerPlayerName` fields
    - Update `getQueue()` to look up pair data for entries with non-null `pair_id`
    - Populate partner player info from the `fixed_pairs` table
    - _Requirements: 2.1, 6.1_

  - [x] 4.2 Modify `removePlayer` in queueService to handle pair dissolution
    - When removing a player who is part of a Fixed_Pair, dissolve the pair first
    - Place the remaining partner as an individual queue entry at the original pair slot position
    - Then proceed with normal player removal
    - _Requirements: 5.3_

  - [x] 4.3 Write property tests for pair-aware queue operations
    - **Property 5: Pair displayed as single queue entry**
    - **Property 6: Pair slot moves as atomic unit**
    - **Property 7: Pair slot removal removes both players**
    - **Property 16: Individual player removal dissolves pair and preserves partner**
    - **Validates: Requirements 2.1, 2.2, 2.3, 5.3, 6.1**

- [x] 5. Pairing service: Integrate fixed pairs into match selection
  - [x] 5.1 Extend pairing service types and candidate building for pairs
    - Add `isPair`, `pairId`, `pairedPlayerIds` fields to `PairingInput` candidates
    - Update `buildCandidatePool` in `courtService.ts` to include Fixed_Pairs as single candidates with combined rating
    - Ensure pair candidates count as one team slot in the candidate pool
    - _Requirements: 3.1, 3.3, 3.4_

  - [x] 5.2 Update courtService startMatch to expand pair candidates into player IDs
    - After `selectPairing` / `selectFifoPairing` returns a result, expand any pair candidate into its two constituent player IDs
    - Ensure both players of a pair end up on the same team in the match record
    - Update minimum player check: require at least 2 team slots (4 total players across all slots)
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 5.4_

  - [x] 5.3 Update courtService completeMatch to re-insert pairs as single slots
    - When returning players to queue after match completion, check if players are part of a Fixed_Pair
    - Re-insert Fixed_Pairs as a single pair slot at the end of the queue (not as two individual entries)
    - _Requirements: 2.4_

  - [x] 5.4 Write property tests for pairing service with fixed pairs
    - **Property 9: Paired players always placed on same team**
    - **Property 10: Combined rating is arithmetic mean**
    - **Property 11: Candidate pool treats pairs as single team slots**
    - **Property 12: FIFO selection respects pair positions**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

  - [x] 5.5 Write property tests for match completion with pairs
    - **Property 8: Match completion re-inserts pair as single slot**
    - **Property 17: Minimum team slots required for match start**
    - **Validates: Requirements 2.4, 5.4**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. API routes: Add fixed pair endpoints
  - [x] 7.1 Add REST API routes for fixed pair operations
    - Add `POST /api/sessions/:sessionId/pairs` — calls `createFixedPair`, returns created pair
    - Add `DELETE /api/sessions/:sessionId/pairs/:pairId` — calls `dissolveFixedPair`
    - Add `GET /api/sessions/:sessionId/pairs` — calls `getFixedPairsBySession`, returns list
    - Wire error handling through existing `mapValidationErrorToStatus` pattern
    - _Requirements: 1.1, 4.1, 6.4, 6.5_

  - [x] 7.2 Integrate dissolveAllPairs into session end flow
    - In the session end handler, call `dissolveAllPairs(sessionId)` before ending the session
    - Ensure pair records are cleaned up when a session ends
    - _Requirements: 4.4_

  - [x] 7.3 Write integration tests for fixed pair API routes
    - Test POST creates pair and returns 201 with pair data
    - Test DELETE dissolves pair and returns 200
    - Test GET returns all pairs for session
    - Test validation errors return 400 with correct messages
    - Test dissolve non-existent pair returns 404
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 4.1, 4.3_

- [x] 8. Client: Add fixed pair types and API functions
  - [x] 8.1 Extend client types and API module for fixed pairs
    - Add `FixedPair` interface to `client/src/types.ts`
    - Extend `QueueEntry` type with `isPairSlot`, `pairId`, `partnerPlayerId`, `partnerPlayerName` fields
    - Add API functions in `client/src/api.ts`: `createFixedPair`, `dissolveFixedPair`, `getFixedPairs`
    - _Requirements: 6.1, 6.4, 6.5_

- [x] 9. Client: Update queue display and pair controls
  - [x] 9.1 Update QueueList component to render pair slots
    - Render pair slots with a link icon showing both player names
    - Visually distinguish pair slots from individual player entries
    - Ensure pair slots move as a single unit in the queue UI
    - _Requirements: 2.1, 2.2, 6.2_

  - [x] 9.2 Create PairControls component for organizer actions
    - Add UI control for selecting two queue entries and creating a Fixed_Pair
    - Add UI control (button/icon) on pair slots to dissolve an existing Fixed_Pair
    - Wire controls to API functions with loading states and error handling
    - _Requirements: 6.4, 6.5_

  - [x] 9.3 Update CourtGrid/match display to show pair indicators
    - When displaying an active match, indicate which players on a team are part of a Fixed_Pair
    - Show a link icon or visual connector between paired teammates on court
    - _Requirements: 6.3_

  - [x] 9.4 Write client component tests for pair display
    - Test QueueList renders pair slots with link icon and both names
    - Test PairControls calls createFixedPair API on confirm
    - Test PairControls calls dissolveFixedPair API on dissolve action
    - Test CourtGrid shows pair indicator for paired teammates
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout, matching the existing codebase
- `fast-check` and `vitest` are already available in project dependencies

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["2.4", "2.5", "4.1"] },
    { "id": 5, "tasks": ["4.2", "5.1"] },
    { "id": 6, "tasks": ["4.3", "5.2"] },
    { "id": 7, "tasks": ["5.3"] },
    { "id": 8, "tasks": ["5.4", "5.5", "7.1"] },
    { "id": 9, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 10, "tasks": ["9.1", "9.2"] },
    { "id": 11, "tasks": ["9.3"] },
    { "id": 12, "tasks": ["9.4"] }
  ]
}
```

# Implementation Plan: UI Polish and Features

## Overview

This plan implements seven UI enhancements to the Picklestack client: a new Landing Page at `/`, QR code display for live view URLs, a real-time leaderboard card for active sessions, a Live View UI redesign, Dashboard UI polish, conditional hiding of the live view link for ended sessions, and a single-page session creation flow. All changes are client-side React + TypeScript with one new dependency (`qrcode`).

## Tasks

- [x] 1. Set up routing changes and install dependencies
  - [x] 1.1 Install `qrcode` npm package and its TypeScript types
    - Run `npm install qrcode` and `npm install -D @types/qrcode` in the client directory
    - Install `fast-check` as a dev dependency if not already present
    - _Requirements: 2.5_

  - [x] 1.2 Update App.tsx routing to add LandingPage and CreateSession routes
    - Change the `/` route to render a new `LandingPage` component
    - Add a `/create` route pointing to the existing `CreateSession` component
    - Import the new `LandingPage` page component
    - _Requirements: 1.1, 1.10_

- [x] 2. Implement Landing Page
  - [x] 2.1 Create `LandingPage` component
    - Create `client/src/pages/LandingPage.tsx`
    - Implement hero section with headline, subtitle, and primary CTA button navigating to `/create`
    - Implement "How It Works" section with step-by-step instructions (create session, players check in, play matches, view results)
    - Implement "Features" section highlighting smart matchmaking, live spectator view, leaderboards, achievements
    - Implement "Statistics" section with placeholder values (e.g., "1000+ sessions", "5000+ matches", "2000+ players")
    - Implement "Screenshots" section with placeholder illustrations
    - Implement tagline section at the bottom with closing message and secondary CTA button
    - Ensure every section includes a CTA button navigating to `/create`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.10_

  - [x] 2.2 Add Landing Page CSS styles
    - Add responsive styles in `index.css` using existing CSS custom properties and BEM-style naming
    - Single column on mobile, wider layouts with side-by-side elements on tablet/desktop
    - Use existing color scheme (`--color-primary`, `--color-success`, etc.)
    - _Requirements: 1.9_

  - [x] 2.3 Write unit tests for LandingPage
    - Verify all sections render (hero, how-it-works, features, statistics, screenshots, tagline)
    - Verify CTA buttons have correct navigation targets (`/create`)
    - Verify responsive layout classes are applied
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 3. Implement QR Code Display
  - [x] 3.1 Create `QRCodeDisplay` component
    - Create `client/src/components/QRCodeDisplay.tsx`
    - Accept `url: string` and optional `size?: number` (default 160) props
    - Use `qrcode` library to generate inline SVG with high error correction level (level H)
    - Handle errors gracefully: display "QR code unavailable" fallback text with the URL shown as copyable text
    - Render SVG at minimum 128x128 pixels
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 3.2 Write unit tests for QRCodeDisplay
    - Verify SVG renders with correct dimensions
    - Verify error fallback displays when generation fails
    - _Requirements: 2.2, 2.3_

- [ ] 4. Implement Session Leaderboard Card
  - [x] 4.1 Create `LeaderboardCard` component
    - Create `client/src/components/LeaderboardCard.tsx`
    - Accept `playerStats: PlayerStats[]` and optional `startingRatings?: Map<string, number>` props
    - Implement `buildLeaderboardCardEntries` function: filter players with ≥1 match, sort by win rate desc → matches played desc → name asc
    - Display columns: rank, player name, rating delta, record (W-L), win rate %, current rating
    - Implement collapsible toggle (expand/collapse)
    - Hide entirely when no players have completed a match
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 4.2 Write property test for leaderboard sorting and filtering
    - **Property 1: Leaderboard card sorting and filtering**
    - Generate random `PlayerStats[]` arrays using fast-check
    - Verify all returned entries have `matchesPlayed >= 1`
    - Verify adjacent pairs satisfy sort invariant (winRate desc, matchesPlayed desc, name asc)
    - Verify rank values are sequential starting at 1
    - **Validates: Requirements 3.3, 3.5**

  - [x] 4.3 Write property test for leaderboard column completeness
    - **Property 2: Leaderboard card column completeness**
    - Generate random `PlayerStats[]` with at least one player having `matchesPlayed >= 1`
    - Render `LeaderboardCard` and verify each visible player row contains: rank, name, rating delta, W-L record, win rate percentage, current rating
    - **Validates: Requirements 3.2**

  - [x] 4.4 Write unit tests for LeaderboardCard
    - Test collapse/expand toggle functionality
    - Test that card is hidden when no players have matches
    - Test that leaderboard updates when playerStats prop changes
    - _Requirements: 3.5, 3.7_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Live View UI Redesign
  - [x] 6.1 Create `LiveSessionHeader` component
    - Create `client/src/components/LiveSessionHeader.tsx`
    - Accept `sessionName: string`, `activeCourts: number`, `queuedPlayers: number` props
    - Display session name with "LIVE" badge (CSS pulse animation)
    - Display active court count and queued player count
    - _Requirements: 4.3_

  - [x] 6.2 Redesign LiveView page with card-based layout
    - Update `client/src/pages/LiveView.tsx`
    - Replace inline court rendering with `CourtCard`-like markup using `PlayerAvatar` components
    - Display player avatars, names, star ratings, and numeric ratings in team-vs-team layout
    - Add clear "VS" divider between teams on each court card
    - Add `LiveSessionHeader` component at the top
    - Add "On Deck" indicator highlighting next players to be assigned
    - Use card-based CSS classes (`.card`, `.court-card`, border radius, shadows, spacing)
    - Maintain existing 3-second polling interval
    - _Requirements: 4.1, 4.2, 4.4, 4.6, 4.8_

  - [x] 6.3 Add Live View responsive styles and queue list
    - Replace inline queue rendering with styled queue list using `PlayerAvatar`
    - Display numbered positions, player avatars, names, star ratings, numeric ratings, and W-L records
    - Add responsive CSS: stack courts and queue vertically on mobile, side-by-side on tablet/desktop
    - Style session-ended state with card-based styling matching active view
    - _Requirements: 4.2, 4.5, 4.7_

  - [x] 6.4 Write property test for queue list field completeness
    - **Property 3: Queue list field completeness**
    - Generate random queue entries with player stats using fast-check
    - Render the queue list and verify each entry contains: position badge, avatar, name, star rating, numeric rating, W-L record
    - **Validates: Requirements 5.3**

  - [x] 6.5 Write unit tests for LiveView redesign
    - Verify court cards render with avatars and ratings
    - Verify LIVE badge has pulse animation class
    - Verify "On Deck" indicator renders for next group
    - Verify session-ended banner uses card-based styling
    - _Requirements: 4.1, 4.3, 4.6, 4.7_

- [x] 7. Implement Dashboard UI Polish
  - [x] 7.1 Update StatsBar with icons
    - Update `client/src/components/StatsBar.tsx`
    - Add descriptive SVG icons or emoji with proper aria-labels for each metric
    - Person icon for players, checkmark for matches, percentage for win rate, star for rating, shuffle for pairing mode
    - _Requirements: 5.2_

  - [x] 7.2 Update CourtsPanel with enhanced court cards
    - Update `client/src/components/CourtsPanel.tsx`
    - Display player avatars and numeric ratings side-by-side with player names in team layout
    - Add clear "VS" divider between teams
    - _Requirements: 5.1, 5.6_

  - [x] 7.3 Update QueueList with numbered positions and ratings
    - Update `client/src/components/QueueList.tsx`
    - Display numbered position badge, `PlayerAvatar`, player name, star rating icons, numeric rating, and W-L record in a single row
    - Use consistent spacing (`--space-md` between sections, `--space-sm` between items)
    - _Requirements: 5.3, 5.4_

  - [x] 7.4 Apply consistent spacing and color scheme to Dashboard
    - Ensure `--space-md` (1rem) between major sections and `--space-sm` (0.5rem) between items
    - Use `--color-primary` for interactive elements, `--color-success` for positive states, `--color-warning` for attention states
    - _Requirements: 5.4, 5.5_

  - [x] 7.5 Write unit tests for Dashboard UI polish
    - Verify StatsBar renders icons with correct aria-labels
    - Verify CourtsPanel displays avatars, ratings, and VS divider
    - Verify QueueList displays all required fields per entry
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

- [x] 8. Implement conditional hiding of Live View link
  - [x] 8.1 Update OrganizerDashboard to conditionally render live view section
    - Update `client/src/pages/OrganizerDashboard.tsx`
    - Wrap live URL text, copy button, and QR code in a conditional: only render when `session.status === 'active'`
    - Add `QRCodeDisplay` component in the live URL section (active sessions only)
    - Add `LeaderboardCard` component (active sessions only, when playerStats exist)
    - When session ends, replace `LeaderboardCard` with existing full leaderboard display
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 2.1, 2.4, 2.6, 3.1, 3.6_

  - [x] 8.2 Write unit tests for conditional rendering
    - Verify live URL bar, copy button, and QR code are hidden when session status is "ended"
    - Verify live URL bar, copy button, and QR code are shown when session status is "active"
    - Verify LeaderboardCard shows during active session and full leaderboard shows after session ends
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 3.1, 3.6_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Single-Page Session Creation
  - [x] 10.1 Add `PendingPlayer` type and validation functions
    - Add `PendingPlayer` interface to `client/src/types.ts` (localId: string, name: string, starRating: StarRating)
    - Create `client/src/pages/createSessionValidation.ts` with `validateSessionForm` and `validatePlayerName` functions
    - `validateSessionForm`: return error for name if trimmed length outside 1-50, for courtName if length > 50, for courtCount if not integer 1-12
    - `validatePlayerName`: return error if trimmed length outside 1-30
    - _Requirements: 7.3, 7.5_

  - [x] 10.2 Write property test for session form validation correctness
    - **Property 4: Session form validation correctness**
    - Generate random strings (0-100 chars) for name and court name, random numbers (including non-integers, negatives, values outside 1-12) for court count using fast-check
    - Apply `validateSessionForm` and verify errors are returned if and only if input violates constraints
    - **Validates: Requirements 7.3**

  - [x] 10.3 Write property test for player name validation correctness
    - **Property 5: Player name validation correctness**
    - Generate random strings (0-50 chars, including whitespace-only) using fast-check
    - Apply `validatePlayerName` and verify error is returned if and only if trimmed length is outside 1-30
    - **Validates: Requirements 7.5**

  - [x] 10.4 Redesign `CreateSession.tsx` as single-page card-based form
    - Rewrite `client/src/pages/CreateSession.tsx` to remove `SessionSettingsModal` import and usage
    - Remove the two-step flow (create session first, then show modal)
    - Implement three visually distinct section cards using `.card` CSS class (border-radius, box-shadow, padding matching app design language)
    - Each section card has a title and a brief informational description explaining the section's purpose
    - Each individual setting has descriptive helper text below the input explaining what it controls
    - Basic Info card: session name (with helper "Give your session a name so players can find it easily"), court name (with helper "Optionally name your court area"), number of courts (with helper "How many courts are available for play?")
    - Game Settings card: session type (with helper explaining open play vs tournament), game mode (with helper explaining doubles vs singles), matching mode (with helper explaining smart pairing vs queue)
    - Player Check-In card: section description "Add players who are here and ready to play. You can also add more from the dashboard.", player name input with helper text
    - Set default values: session type = "open_play", game mode = "doubles", matching mode = "smart"
    - Manage `pendingPlayers: PendingPlayer[]` in local state with add/remove functionality
    - No API calls until final submit button is clicked
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.12, 7.13, 7.14, 7.15_

  - [x] 10.5 Write property test for player list rendering completeness
    - **Property 6: Player list rendering completeness**
    - Generate random `PendingPlayer[]` arrays using fast-check
    - Render the Player_CheckIn_Section and verify each player's name and star rating appear in the DOM
    - **Validates: Requirements 7.6**

  - [x] 10.6 Write property test for player removal preserves remaining players
    - **Property 7: Player removal preserves remaining players**
    - Generate random `PendingPlayer[]` arrays (length ≥ 1), pick a random index to remove
    - Verify the resulting array contains all other players unchanged and does not contain the removed player
    - **Validates: Requirements 7.7**

  - [x] 10.7 Implement submit orchestration and error handling
    - On submit: validate all fields → create session → update session settings → check in all pending players → navigate to `/session/:id`
    - If session creation or settings update fails: display error message, retain all form data, re-enable submit button
    - If player check-in fails for some players: navigate to dashboard with `{ state: { checkInWarnings: failedPlayerNames } }` via react-router-dom location state
    - Disable submit button while `submitting` is true
    - _Requirements: 7.8, 7.9, 7.10, 7.11_

  - [x] 10.8 Write property test for error state retains form data
    - **Property 8: Error state retains form data**
    - Generate random valid form states (name, court name, court count, session type, game mode, matching mode, pending players) using fast-check
    - Mock `createSession` to throw an error
    - Trigger submit and verify all form field values remain unchanged after the error is displayed
    - **Validates: Requirements 7.10**

  - [x] 10.9 Write unit tests for CreateSession single-page flow
    - Verify all three section cards render on a single page (no modal)
    - Verify each section card has a title and informational description
    - Verify each setting has descriptive helper text visible in the DOM
    - Verify default values: session type = "open_play", game mode = "doubles", matching mode = "smart"
    - Verify no API calls are made until submit button is clicked
    - Verify `SessionSettingsModal` is never rendered
    - Verify submit orchestration sequence: createSession → updateSessionSettings → addPlayer (for each) → navigate
    - Verify partial player check-in failure still navigates with warning state
    - Verify full session creation failure shows error and retains all data
    - _Requirements: 7.1, 7.2, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1-8)
- Unit tests validate specific examples and edge cases
- All components use existing CSS custom properties and BEM-style class naming
- The `qrcode` library generates SVG client-side with no server dependency
- The `fast-check` library is used for property-based testing with Vitest
- The `PendingPlayer` type is client-side only and never sent directly to the server
- The `SessionSettingsModal` is retained for editing from the dashboard but removed from the creation flow

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "10.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.2", "4.3", "4.4", "6.1", "10.2", "10.3"] },
    { "id": 3, "tasks": ["6.2", "6.3", "7.1", "7.2", "7.3", "10.4"] },
    { "id": 4, "tasks": ["6.4", "6.5", "7.4", "7.5", "10.5", "10.6"] },
    { "id": 5, "tasks": ["8.1", "10.7"] },
    { "id": 6, "tasks": ["8.2", "10.8", "10.9"] }
  ]
}
```

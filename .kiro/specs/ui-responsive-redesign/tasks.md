# Implementation Plan: UI Responsive Redesign

## Overview

Transform the Picklestack client from a single-column, inline-styled layout into a responsive, component-based application. The implementation proceeds in layers: CSS foundation first, then layout shell with navigation, then dashboard panels and redesigned components, and finally mobile optimizations and integration wiring.

## Tasks

- [x] 1. CSS Architecture and Design Tokens
  - [x] 1.1 Define CSS custom properties and base styles in `index.css`
    - Add `:root` block with all color tokens (`--color-sidebar`, `--color-bg`, `--color-surface`, `--color-primary`, `--color-success`, `--color-warning`, `--color-danger`, `--color-text-primary`, `--color-text-secondary`, `--color-text-inverse`)
    - Add spacing tokens (`--space-xs` through `--space-xl`), border radius tokens (`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`), typography tokens (font sizes `--text-xs` through `--text-xl`, font weights `--font-normal` through `--font-bold`)
    - Define responsive breakpoint media queries for tablet (min-width: 768px) and desktop (min-width: 1024px)
    - Add utility classes for common patterns (flex, grid, spacing, text alignment)
    - Update body styles to use the system font stack and custom properties
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 10.1, 10.6_

  - [x] 1.2 Define component CSS classes for layout shell, sidebar, bottom tab bar, and session header
    - Add `.layout-shell`, `.sidebar`, `.sidebar--collapsed`, `.sidebar--expanded`, `.bottom-tab-bar`, `.session-header` classes
    - Add responsive rules: sidebar hidden on mobile, bottom tab bar hidden on tablet/desktop
    - Add `.nav-item`, `.nav-item--active` classes with proper touch target sizing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 9.1_

  - [x] 1.3 Define component CSS classes for dashboard panels, queue list, court cards, stats bar, and match dialog
    - Add `.queue-panel`, `.courts-panel`, `.dashboard-layout` classes with responsive grid/flex rules (35/65 desktop, 50/50 tablet, stacked mobile)
    - Add `.court-card`, `.status-badge`, `.player-avatar`, `.stats-bar` classes
    - Add `.match-dialog`, `.match-dialog__team-card` classes with mobile slide-up sheet behavior
    - Add card styling (white background, border radius, border, box-shadow) as per design tokens
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.3, 6.1, 6.2, 6.6, 6.7, 7.1, 7.3, 7.4, 8.5, 10.6_

- [x] 2. Layout Shell and Navigation Components
  - [x] 2.1 Create `PlayerAvatar` utility component
    - Create `client/src/components/PlayerAvatar.tsx`
    - Implement `getAvatarColor(name)` hash function returning a color from the predefined palette
    - Render circular div with initials (first + last name initial), hash-derived background, white text
    - Accept `size` prop (default 36px)
    - _Requirements: 5.1, 5.2, 6.3, 8.1_

  - [x] 2.2 Write unit tests for `PlayerAvatar` and `getAvatarColor`
    - Verify deterministic color output for known names
    - Verify correct initials extraction (single name, two names, multi-word names)
    - Verify rendered output has correct CSS class and size
    - _Requirements: 5.2_

  - [x] 2.3 Create `LayoutShell` component
    - Create `client/src/components/LayoutShell.tsx`
    - Render Sidebar and BottomTabBar (CSS controls visibility based on viewport)
    - Render SessionHeader when on a session route (detect via `useLocation`)
    - Render children in main content area with proper margins
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.7_

  - [x] 2.4 Create `Sidebar` component
    - Create `client/src/components/Sidebar.tsx`
    - Render nav items (Dashboard, Live View, Players, Settings) with icons and labels
    - Use `activeRoute` from `useLocation` to highlight current item
    - Dark navy background with white text, active item with lighter background and accent indicator
    - Collapsed (64px, icons only) on tablet, expanded (240px, icons + labels) on desktop
    - _Requirements: 2.2, 2.3, 2.4, 10.3_

  - [x] 2.5 Create `BottomTabBar` component
    - Create `client/src/components/BottomTabBar.tsx`
    - Render tab items (Dashboard, Live View, Players, Settings) with icons
    - Fixed to viewport bottom, 44x44px minimum touch targets
    - Active tab highlighted with primary accent color
    - _Requirements: 2.1, 2.6, 9.1_

  - [x] 2.6 Integrate `LayoutShell` into `App.tsx`
    - Wrap `<Routes>` with `<LayoutShell>` component
    - Remove old `.page` container usage from pages that will use the new layout
    - _Requirements: 2.5, 2.7_

- [x] 3. Checkpoint - Layout shell renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Session Header and Stats Bar
  - [x] 4.1 Create `SessionHeader` component
    - Create `client/src/components/SessionHeader.tsx`
    - Display session name, "LIVE" badge with pulsing green dot animation, date/time, court name subtitle
    - Action buttons: Pairing Mode toggle, Session Settings, End Session (aligned right)
    - Fixed at top of content area, stacks vertically on mobile with icon-only buttons
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.2 Create `StatsBar` component
    - Create `client/src/components/StatsBar.tsx`
    - Display metrics: total players (person icon), matches played (checkmark icon), average win rate (%), average rating, pairing mode label
    - Horizontal row on tablet/desktop, 2x3 grid on mobile
    - Subtle surface background with top border separator
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.3 Write unit tests for `SessionHeader` and `StatsBar`
    - Verify SessionHeader renders session name, live badge, action buttons
    - Verify StatsBar displays all metrics with correct formatting
    - Verify StatsBar computes averages correctly from player stats data
    - _Requirements: 3.1, 3.2, 7.2, 7.5_

- [x] 5. Queue Panel Redesign
  - [x] 5.1 Create `QueuePanel` wrapper component
    - Create `client/src/components/QueuePanel.tsx`
    - Render fixed header with "QUEUE" title, player count, and "Add Player" button
    - Expand inline CheckInForm when "Add Player" is clicked
    - Scrollable list area constrained to viewport height minus header/stats bar
    - _Requirements: 4.4, 4.6_

  - [x] 5.2 Refactor `QueueList` component rendering
    - Replace inline styles with CSS classes
    - Each entry: PlayerAvatar (36px), player name, star rating icons, numeric rating, W-L record
    - On Deck players: 4px left border (`--color-warning`), warm background tint
    - Queue management buttons (↑ ↓ ✕): hover-reveal on desktop, always visible on mobile/tablet
    - Streak badge (🔥 wins, ❄️ losses) when streak ≥ 2
    - Minimum 56px row height on mobile for touch targets
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.1, 9.4_

  - [x] 5.3 Implement swipe-to-remove gesture on queue items for mobile
    - Detect horizontal swipe on queue items within mobile viewport
    - Reveal remove action as slide-out button on right side
    - Use touch event handlers with threshold detection
    - _Requirements: 9.6_

  - [x] 5.4 Write unit tests for `QueuePanel` and `QueueList`
    - Verify player entries render with avatars, ratings, W-L records
    - Verify On Deck highlighting applied correctly
    - Verify streak badges appear when streak ≥ 2
    - Verify queue management buttons visibility behavior
    - _Requirements: 5.1, 5.3, 5.4, 5.6_

- [x] 6. Courts Panel Redesign
  - [x] 6.1 Create `CourtsPanel` wrapper component
    - Create `client/src/components/CourtsPanel.tsx`
    - Render fixed header with "COURTS" title and active match count
    - Scrollable grid area for court cards
    - 2-column grid on desktop, single column on tablet/mobile
    - _Requirements: 4.5, 6.6_

  - [x] 6.2 Refactor `CourtGrid` and court card rendering
    - Replace inline styles with CSS classes
    - Card header: court number + Status Badge (colored pill: green "In Progress", amber "Next Up", gray "Available")
    - Left border accent matching status color
    - Team sections with PlayerAvatars, names, star ratings, numeric ratings, "VS" divider
    - Footer: match number + elapsed duration ("Xm")
    - Full-width "Complete Match" button with `--color-success`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 10.4_

  - [x] 6.3 Write unit tests for `CourtsPanel` and `CourtCard`
    - Verify Status Badge renders correct text and color for each court state
    - Verify team sections display player details correctly
    - Verify "Complete Match" button renders for active matches only
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [x] 7. Checkpoint - Dashboard panels render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Match Completion Dialog Redesign
  - [x] 8.1 Refactor `MatchCompleteDialog` component
    - Replace inline styles with CSS classes
    - Dialog header: court number + match duration
    - Side-by-side team layout (desktop/tablet), stacked on mobile
    - Each team as selectable card with PlayerAvatars, names, ratings
    - Radio selection for winning team with card highlight on selection
    - Score input fields below team cards
    - Footer: "Skip Match" (secondary) + "Confirm Result" (primary)
    - Mobile: full-width slide-up sheet from bottom with 16px horizontal padding
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 8.2 Write unit tests for `MatchCompleteDialog`
    - Verify both teams render with player details
    - Verify radio selection highlights the chosen team card
    - Verify Skip and Confirm buttons render with correct styling
    - _Requirements: 8.1, 8.2, 8.4_

- [x] 9. Two-Panel Dashboard Integration
  - [x] 9.1 Refactor `OrganizerDashboard` page to use new panel layout
    - Replace current single-column layout with `QueuePanel` + `CourtsPanel` side-by-side
    - Add `StatsBar` at bottom of dashboard content
    - Wire existing state management and API calls to new panel components
    - Apply responsive grid: 35/65 desktop, 50/50 tablet, stacked mobile
    - _Requirements: 4.1, 4.2, 4.3, 7.1_

  - [x] 9.2 Wire `SessionHeader` into `LayoutShell` with session data
    - Pass session name, live status, court name, date/time from session route context
    - Connect Pairing Mode toggle, Session Settings, and End Session action handlers
    - _Requirements: 3.1, 3.2, 3.6_

- [x] 10. Mobile Touch Optimization and Polish
  - [x] 10.1 Apply touch optimization CSS rules
    - Ensure all interactive elements meet 44x44px minimum on mobile/tablet
    - Add 8px minimum spacing between adjacent interactive elements
    - Set `scroll-behavior: smooth` on scrollable containers
    - Add `-webkit-overflow-scrolling: touch` for iOS momentum scrolling
    - Set `font-size: 16px` minimum on all input fields to prevent iOS auto-zoom
    - Disable hover-dependent interactions on touch devices (make hover-revealed controls always visible)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 10.2 Remove inline styles from all redesigned components
    - Audit all modified components for remaining inline `style` attributes
    - Replace any remaining inline styles with CSS classes referencing custom properties
    - Verify no inline styles remain in redesigned components
    - _Requirements: 1.4_

  - [x] 10.3 Write integration tests for responsive layout behavior
    - Mock `window.matchMedia` to simulate mobile (375px), tablet (768px), desktop (1280px)
    - Verify LayoutShell renders BottomTabBar on mobile, Sidebar on tablet/desktop
    - Verify dashboard panels stack on mobile, side-by-side on tablet/desktop
    - Verify touch target sizing meets 44px minimum
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 9.1_

- [x] 11. Final Checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- No property-based tests are included because this feature is a UI rendering/layout redesign with no algorithmic logic suitable for PBT (as noted in the design document)
- The design explicitly preserves existing component logic (state, API calls, event handlers) — only rendering markup and styling changes
- CSS classes are defined first (task 1) so all subsequent component work can reference them immediately
- The project uses Vitest for testing and React Testing Library should be added as a dev dependency for component tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["2.6", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2"] },
    { "id": 6, "tasks": ["5.4", "6.3", "8.1"] },
    { "id": 7, "tasks": ["8.2", "9.1"] },
    { "id": 8, "tasks": ["9.2", "10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3"] }
  ]
}
```

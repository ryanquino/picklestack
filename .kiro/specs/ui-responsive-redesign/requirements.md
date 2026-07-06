# Requirements Document

## Introduction

UI Responsive Redesign transforms the Picklestack session management dashboard from a single-column, inline-styled layout into a polished, responsive application with proper navigation, two-panel layouts, and mobile-first design. The current app uses inline styles throughout, has no navigation structure, and renders all content in a single narrow column. This feature introduces:

1. **Responsive Layout System** — a mobile-first layout with bottom tab navigation on mobile, collapsible sidebar on tablet, and full dark sidebar on desktop, replacing the current single-column `.page` container.
2. **Two-Panel Dashboard** — a redesigned OrganizerDashboard with a Queue panel (left) and Courts panel (right) side-by-side on larger screens, stacking vertically on mobile.
3. **Redesigned Court Cards** — card-based court display with status badges (In Progress, Next Up, Upcoming), team matchup layout with player avatars and ratings, match duration, and prominent action buttons.
4. **Redesigned Queue List** — player entries with circular avatar initials, star rating display, numeric rating, and win-loss record in a compact row layout.
5. **Session Header Bar** — a top header showing session name, live status badge, date/time, venue name, and action buttons (Pairing Mode toggle, Session Settings, End Session).
6. **Session Stats Summary Bar** — a bottom stats bar displaying total players, matches played, average win rate, average rating, and current pairing mode.
7. **Improved Match Completion Dialog** — redesigned to show both teams with player avatars and ratings, radio selection for winning team, and clear Skip/Confirm buttons.
8. **CSS Architecture Migration** — replacing inline styles with a structured CSS approach using the existing `index.css` file with CSS custom properties and utility classes.

## Glossary

- **App**: The Picklestack web application client
- **Layout_Shell**: The top-level responsive container that wraps all page content and provides navigation, header, and content areas
- **Sidebar**: A vertical navigation panel displayed on tablet and desktop viewports containing links to Dashboard, Live View, Players, Sessions, Leaderboard, and Settings
- **Bottom_Tab_Bar**: A fixed-position horizontal navigation bar displayed at the bottom of the viewport on mobile devices
- **Session_Header**: A horizontal bar at the top of the dashboard content area displaying session metadata and action buttons
- **Queue_Panel**: The left content panel on the OrganizerDashboard displaying the ordered list of waiting players
- **Courts_Panel**: The right content panel on the OrganizerDashboard displaying court cards with active and upcoming matches
- **Court_Card**: A card component representing a single court with its status, team matchup, and action controls
- **Status_Badge**: A colored label indicating a court's current state (In Progress, Next Up, or Upcoming)
- **Player_Avatar**: A circular element displaying a player's initials as a visual identifier
- **Stats_Bar**: A horizontal summary bar at the bottom of the dashboard displaying aggregate session statistics
- **Breakpoint_Mobile**: A viewport width of 0 to 767 pixels
- **Breakpoint_Tablet**: A viewport width of 768 to 1023 pixels
- **Breakpoint_Desktop**: A viewport width of 1024 pixels and above
- **CSS_Custom_Properties**: CSS variables defined at the root level for consistent theming (colors, spacing, typography)
- **Touch_Target**: An interactive element sized at minimum 44x44 pixels for accessible touch interaction

## Requirements

### Requirement 1: CSS Architecture and Design Tokens

**User Story:** As a developer, I want a structured CSS system with design tokens replacing inline styles, so that the UI is consistent, maintainable, and themeable.

#### Acceptance Criteria

1. THE App SHALL define CSS_Custom_Properties in the `:root` selector of `index.css` for all color values including: sidebar background (`--color-sidebar`, dark navy #1e293b), content background (`--color-bg`, white #ffffff), surface background (`--color-surface`, #f9fafb), primary accent (`--color-primary`, #2563eb), success accent (`--color-success`, #10b981), warning accent (`--color-warning`, #f59e0b), danger accent (`--color-danger`, #dc2626), and text colors (`--color-text-primary` #111827, `--color-text-secondary` #6b7280, `--color-text-inverse` #ffffff).
2. THE App SHALL define CSS_Custom_Properties for spacing values (`--space-xs` 0.25rem, `--space-sm` 0.5rem, `--space-md` 1rem, `--space-lg` 1.5rem, `--space-xl` 2rem) and border radius values (`--radius-sm` 4px, `--radius-md` 8px, `--radius-lg` 12px, `--radius-full` 9999px).
3. THE App SHALL define CSS_Custom_Properties for typography including font sizes (`--text-xs` 0.75rem, `--text-sm` 0.875rem, `--text-base` 1rem, `--text-lg` 1.125rem, `--text-xl` 1.25rem) and font weights (`--font-normal` 400, `--font-medium` 500, `--font-semibold` 600, `--font-bold` 700).
4. THE App SHALL replace inline `style` attributes in all redesigned components with CSS classes defined in `index.css` that reference the CSS_Custom_Properties.
5. THE App SHALL define responsive breakpoint media queries for Breakpoint_Tablet (min-width: 768px) and Breakpoint_Desktop (min-width: 1024px) in `index.css`.

### Requirement 2: Responsive Layout Shell

**User Story:** As a user, I want consistent navigation that adapts to my device size, so that I can access all features whether on my phone, tablet, or desktop.

#### Acceptance Criteria

1. WHILE the viewport width is within Breakpoint_Mobile, THE Layout_Shell SHALL display a Bottom_Tab_Bar fixed to the bottom of the viewport with navigation icons for Dashboard, Live View, Players, and Settings, and SHALL NOT display the Sidebar.
2. WHILE the viewport width is within Breakpoint_Tablet, THE Layout_Shell SHALL display the Sidebar in a collapsed state (icons only, 64px wide) on the left side of the viewport, and SHALL NOT display the Bottom_Tab_Bar.
3. WHILE the viewport width is within Breakpoint_Desktop, THE Layout_Shell SHALL display the Sidebar in an expanded state (icons and labels, 240px wide) on the left side of the viewport with organizer information at the bottom, and SHALL NOT display the Bottom_Tab_Bar.
4. THE Sidebar SHALL use a dark navy background color (`--color-sidebar`) with white text (`--color-text-inverse`) and SHALL highlight the currently active navigation item with a lighter background and accent color indicator.
5. THE Layout_Shell SHALL render the main content area to the right of the Sidebar (on tablet and desktop) or above the Bottom_Tab_Bar (on mobile), filling the remaining viewport space.
6. THE Bottom_Tab_Bar SHALL use a minimum Touch_Target size of 44x44 pixels for each navigation item and SHALL display the currently active tab with the primary accent color (`--color-primary`).
7. THE Layout_Shell SHALL include a Session_Header bar at the top of the main content area when a session is active.

### Requirement 3: Session Header Bar

**User Story:** As an organizer, I want to see session status and access key actions from a persistent header, so that I can manage the session without scrolling.

#### Acceptance Criteria

1. THE Session_Header SHALL display the session name, a "LIVE" status badge with a green background when the session is active, and the current date and time.
2. THE Session_Header SHALL display action buttons for Pairing Mode toggle, Session Settings, and End Session aligned to the right side of the header.
3. WHILE the viewport width is within Breakpoint_Mobile, THE Session_Header SHALL stack the session info and action buttons vertically and SHALL reduce button labels to icons only.
4. THE Session_Header SHALL remain fixed at the top of the content area and SHALL NOT scroll with the page content.
5. THE "LIVE" status badge SHALL use a pulsing green dot animation to indicate the session is actively running.
6. IF the session has a court name configured, THEN THE Session_Header SHALL display the court name as a subtitle below the session name.

### Requirement 4: Two-Panel Dashboard Layout

**User Story:** As an organizer, I want to see the queue and courts side-by-side, so that I can manage players and matches simultaneously without scrolling between sections.

#### Acceptance Criteria

1. WHILE the viewport width is within Breakpoint_Desktop, THE OrganizerDashboard SHALL display the Queue_Panel and Courts_Panel side-by-side with the Queue_Panel occupying approximately 35% width and the Courts_Panel occupying approximately 65% width.
2. WHILE the viewport width is within Breakpoint_Tablet, THE OrganizerDashboard SHALL display the Queue_Panel and Courts_Panel side-by-side with equal 50% width.
3. WHILE the viewport width is within Breakpoint_Mobile, THE OrganizerDashboard SHALL stack the Queue_Panel above the Courts_Panel vertically, each occupying full width.
4. THE Queue_Panel SHALL have a fixed header showing "QUEUE" with the player count and a scrollable list area that does not exceed the viewport height minus the Session_Header and Stats_Bar heights.
5. THE Courts_Panel SHALL have a fixed header showing "COURTS" with the active match count and a scrollable grid area for Court_Cards.
6. THE OrganizerDashboard SHALL display the check-in form within the Queue_Panel header area, accessible via an "Add Player" button that expands the form inline.

### Requirement 5: Redesigned Queue List

**User Story:** As an organizer, I want a visually rich queue list showing player identity and stats at a glance, so that I can quickly assess who is waiting and their skill level.

#### Acceptance Criteria

1. THE Queue_Panel SHALL display each player entry as a horizontal row containing: a Player_Avatar (circular, 36px diameter, displaying first and last initials), the player name, star rating as filled star icons, numeric rating value, and win-loss record formatted as "W-L".
2. THE Player_Avatar SHALL use a background color derived from the player's name (consistent hash-based color) and white text for the initials.
3. THE Queue_Panel SHALL visually distinguish "On Deck" players from other players using a highlighted left border (4px, `--color-warning`) and a subtle warm background tint.
4. THE Queue_Panel SHALL display queue management controls (move up, move down, remove) as icon buttons that appear on hover (desktop) or are always visible (mobile and tablet).
5. WHILE the viewport width is within Breakpoint_Mobile, THE Queue_Panel SHALL display each player entry with a minimum height of 56px to ensure Touch_Target compliance for all interactive elements.
6. THE Queue_Panel SHALL display the player's current streak as a compact badge (fire emoji for wins, snowflake for losses) next to the win-loss record when the streak is 2 or greater.

### Requirement 6: Redesigned Court Cards

**User Story:** As an organizer, I want court cards that clearly show match status, team compositions, and player details, so that I can monitor all active games at a glance.

#### Acceptance Criteria

1. THE Courts_Panel SHALL display each court as a Court_Card with a header containing the court number and a Status_Badge indicating the court state.
2. THE Status_Badge SHALL display "In Progress" with a green background for active matches, "Next Up" with an amber background for the next court to receive players, and "Available" with a gray background for idle courts.
3. THE Court_Card for an active match SHALL display two team sections separated by a "VS" divider, with each team section showing player names, Player_Avatars, star ratings, and numeric ratings.
4. THE Court_Card SHALL display the match number (sequential within the session) and elapsed duration (formatted as "Xm" for minutes) in the card footer.
5. THE Court_Card SHALL display a prominent "Complete Match" button spanning the full card width with the success accent color (`--color-success`) for active matches.
6. WHILE the viewport width is within Breakpoint_Desktop, THE Courts_Panel SHALL display Court_Cards in a 2-column grid layout. WHILE within Breakpoint_Tablet, THE Courts_Panel SHALL display Court_Cards in a single column. WHILE within Breakpoint_Mobile, THE Courts_Panel SHALL display Court_Cards in a single column with full width.
7. THE Court_Card SHALL use a left border accent color matching the Status_Badge color (green for active, amber for next up, gray for available).

### Requirement 7: Session Stats Summary Bar

**User Story:** As an organizer, I want a quick overview of session statistics, so that I can gauge session activity without navigating away from the dashboard.

#### Acceptance Criteria

1. THE Stats_Bar SHALL be displayed at the bottom of the OrganizerDashboard content area, above the Bottom_Tab_Bar on mobile or at the bottom of the main content on tablet and desktop.
2. THE Stats_Bar SHALL display the following metrics in a horizontal row: total players (with person icon), matches played (with checkmark icon), average win rate (as percentage), average rating (numeric), and current pairing mode label.
3. THE Stats_Bar SHALL use a subtle background color (`--color-surface`) with a top border to visually separate it from the content above.
4. WHILE the viewport width is within Breakpoint_Mobile, THE Stats_Bar SHALL display metrics in a 2x3 grid layout instead of a single horizontal row.
5. THE Stats_Bar SHALL update all displayed metrics in real-time as matches are completed and players are added or removed.

### Requirement 8: Improved Match Completion Dialog

**User Story:** As an organizer, I want a clear match completion interface showing both teams with their details, so that I can quickly confirm results without confusion about which team is which.

#### Acceptance Criteria

1. WHEN the Organizer opens the match completion dialog, THE App SHALL display both teams in a side-by-side layout (desktop and tablet) or stacked layout (mobile) with each team showing Player_Avatars, player names, and current ratings.
2. THE match completion dialog SHALL display a radio button selection for choosing the winning team, with each team's section acting as a selectable card that highlights when chosen.
3. THE match completion dialog SHALL display numeric score input fields for each team, positioned below the team cards, with the winning team auto-determined from the higher score.
4. THE match completion dialog SHALL display a "Skip Match" button with secondary styling and a "Confirm Result" button with primary styling in the dialog footer.
5. WHILE the viewport width is within Breakpoint_Mobile, THE match completion dialog SHALL occupy the full viewport width with 16px horizontal padding and SHALL be positioned at the bottom of the screen as a slide-up sheet.
6. THE match completion dialog SHALL display a brief match summary (court number, match duration) in the dialog header.

### Requirement 9: Mobile Touch Optimization

**User Story:** As a mobile user, I want all interactive elements to be easy to tap and the interface to feel native, so that I can manage sessions comfortably on my phone.

#### Acceptance Criteria

1. THE App SHALL size all interactive elements (buttons, links, toggles, list items with actions) at a minimum of 44x44 pixels on touch devices within Breakpoint_Mobile and Breakpoint_Tablet.
2. THE App SHALL add 8px minimum spacing between adjacent interactive elements to prevent accidental taps.
3. THE App SHALL use CSS `scroll-behavior: smooth` for all scrollable containers and SHALL support momentum scrolling with `-webkit-overflow-scrolling: touch` on iOS devices.
4. THE App SHALL disable hover-dependent interactions on touch devices and SHALL make all hover-revealed controls (queue management buttons) permanently visible on mobile and tablet viewports.
5. THE App SHALL use `font-size: 16px` minimum for all input fields to prevent iOS auto-zoom behavior when inputs are focused.
6. WHEN a swipe gesture is detected on a queue item within Breakpoint_Mobile, THE App SHALL reveal the remove action as a slide-out button on the right side of the item.

### Requirement 10: Typography and Color System

**User Story:** As a user, I want a consistent, readable interface with clear visual hierarchy, so that I can quickly scan and understand the dashboard information.

#### Acceptance Criteria

1. THE App SHALL use the system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) for all text content with a base line-height of 1.5.
2. THE App SHALL apply the following typographic hierarchy: page headings at `--text-xl` with `--font-bold`, section headings at `--text-lg` with `--font-semibold`, body text at `--text-base` with `--font-normal`, and secondary text at `--text-sm` with `--color-text-secondary`.
3. THE App SHALL use the dark navy color (`--color-sidebar`) exclusively for the Sidebar background and SHALL use white (`--color-bg`) for the main content area background.
4. THE App SHALL use green (`--color-success`) for positive states (active matches, win indicators, confirm actions), amber (`--color-warning`) for attention states (On Deck, next up, warnings), and red (`--color-danger`) for destructive actions (remove player, end session) and loss indicators.
5. THE App SHALL maintain a minimum contrast ratio of 4.5:1 between text and background colors for all text content to meet WCAG AA accessibility standards.
6. THE App SHALL apply consistent card styling across all card elements: white background, `--radius-md` border radius, 1px solid border in `#e5e7eb`, and a subtle box-shadow (`0 1px 3px rgba(0,0,0,0.1)`).

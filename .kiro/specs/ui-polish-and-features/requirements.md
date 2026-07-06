# Requirements Document

## Introduction

UI Polish and Features enhances the Picklestack application with a set of visual improvements and new functionality to create a more professional, user-friendly experience. This spec covers seven areas:

1. **Landing Page** — A new marketing-style home page replacing the current bare CreateSession form, with a headline, call-to-action, feature highlights, usage statistics, and screenshots.
2. **QR Code for Live View** — Generating and displaying a scannable QR code for the live view URL instead of relying solely on copy-paste.
3. **Session Leaderboard Card (Active Sessions)** — Displaying a real-time leaderboard card on the OrganizerDashboard while a session is still running, not only after it ends.
4. **Live View UI Redesign** — A significant visual overhaul of the live spectator view to match the app's card-based design language with avatars, proper layout, and responsive design.
5. **Dashboard UI Polish** — Refining the OrganizerDashboard to present cleaner court cards, a stats bar with icons, and a queue list with numbered positions, star ratings, and W-L records matching a professional reference design.
6. **Remove Live View Link from Ended Sessions** — Hiding the live view URL on the OrganizerDashboard once a session has ended since it is no longer useful.
7. **Single-Page Session Creation** — Consolidating the two-step session creation flow (form → modal) into a single page where all settings and player check-in are configured before the session is created on the server.

## Glossary

- **App**: The Picklestack web application (React + TypeScript client with Vite bundler)
- **Landing_Page**: The new home page displayed at the root route (`/`) providing marketing content and a call-to-action to start a session
- **Organizer_Dashboard**: The session management page at `/session/:sessionId` used by the session organizer
- **Live_View**: The spectator-facing page at `/live/:sessionId` showing real-time session state
- **QR_Code**: A machine-readable two-dimensional barcode encoding the Live_View URL
- **Leaderboard_Card**: A card component displaying ranked player statistics (rank, name, rating change, record, win rate, rating)
- **Court_Card**: A card component representing a single court with player avatars, ratings, and match status
- **Stats_Bar**: A horizontal bar displaying aggregate session metrics with icons
- **Queue_List**: The ordered list of players waiting to play, displayed with position numbers, star ratings, and records
- **Player_Avatar**: A circular element displaying a player's initials as a visual identifier
- **CTA_Button**: A prominent call-to-action button directing users to start a game session
- **Section**: A visually distinct block of content on the Landing_Page (hero, how-it-works, features, statistics, screenshots, tagline)
- **Session_Creation_Page**: The single-page form at `/create` where organizers configure all session settings and check in players before creating the session on the server
- **Basic_Info_Section**: The section of the Session_Creation_Page containing session name, court name, and number of courts
- **Game_Settings_Section**: The section of the Session_Creation_Page containing session type, game mode, and matching mode
- **Player_CheckIn_Section**: The section of the Session_Creation_Page where organizers add players with names and star ratings before session creation

## Requirements

### Requirement 1: Landing Page

**User Story:** As a visitor, I want to see an informative and visually appealing home page, so that I understand what Picklestack does and can quickly start a session.

#### Acceptance Criteria

1. WHEN a user navigates to the root route (`/`), THE App SHALL display the Landing_Page instead of the CreateSession form directly.
2. THE Landing_Page SHALL display a hero Section at the top containing a headline describing the app purpose, a subtitle with a brief value proposition, and a primary CTA_Button labeled to start a game session.
3. THE Landing_Page SHALL display a "How It Works" Section containing step-by-step instructions explaining the session workflow (create session, players check in, play matches, view results).
4. THE Landing_Page SHALL display a "Features" Section highlighting key capabilities of the app (smart matchmaking, live spectator view, leaderboards, achievements).
5. THE Landing_Page SHALL display a "Statistics" Section showing aggregate usage metrics (total sessions created, total matches played, total players served) with placeholder values if real data is unavailable.
6. THE Landing_Page SHALL display a "Screenshots" Section containing representative UI screenshots or illustrations of the app in use.
7. THE Landing_Page SHALL display a tagline Section at the bottom with a closing message and a secondary CTA_Button to start a session.
8. THE Landing_Page SHALL include a CTA_Button in every Section that navigates the user to the session creation flow.
9. THE Landing_Page SHALL be fully responsive, displaying content in a single column on mobile viewports and using wider layouts with side-by-side elements on tablet and desktop viewports.
10. THE Landing_Page SHALL provide a navigation path to the CreateSession form (either inline on the page or via a dedicated route such as `/create`).

### Requirement 2: QR Code for Live View URL

**User Story:** As an organizer, I want a QR code displayed for the live view URL, so that spectators can quickly scan it with their phone camera instead of manually typing or copying the link.

#### Acceptance Criteria

1. WHEN a session is active, THE Organizer_Dashboard SHALL display a QR_Code encoding the full Live_View URL (`{origin}/live/{sessionId}`).
2. THE QR_Code SHALL be rendered as an inline SVG or canvas element with a minimum display size of 128x128 pixels.
3. THE QR_Code SHALL use a high error correction level to remain scannable even when displayed on screens with glare or at a distance.
4. THE Organizer_Dashboard SHALL continue to display the text Live_View URL alongside the QR_Code so that users can still copy the link manually.
5. THE QR_Code SHALL be generated client-side without requiring a server round-trip.
6. WHEN the session has ended, THE Organizer_Dashboard SHALL NOT display the QR_Code.

### Requirement 3: Session Leaderboard Card (Active Sessions)

**User Story:** As an organizer, I want to see a live leaderboard while the session is running, so that I can track player rankings and performance in real-time without waiting for the session to end.

#### Acceptance Criteria

1. WHILE a session is active, THE Organizer_Dashboard SHALL display a Leaderboard_Card showing current player rankings.
2. THE Leaderboard_Card SHALL display the following columns for each player: rank, player name, rating change (delta from starting rating), record (wins-losses), win rate (percentage), and current rating.
3. THE Leaderboard_Card SHALL sort players by win rate descending, with matches played as a tiebreaker (more matches ranked higher), then alphabetical name as a final tiebreaker.
4. THE Leaderboard_Card SHALL update its data each time the Organizer_Dashboard refreshes session state (on the existing polling interval).
5. THE Leaderboard_Card SHALL only display players who have completed at least one match.
6. WHEN the session ends, THE Organizer_Dashboard SHALL replace the Leaderboard_Card with the existing full session leaderboard display.
7. THE Leaderboard_Card SHALL be collapsible so that the organizer can hide it to reduce visual clutter during active management.

### Requirement 4: Live View UI Redesign

**User Story:** As a spectator, I want the live view page to look polished and professional, so that the viewing experience matches the quality of the organizer dashboard.

#### Acceptance Criteria

1. THE Live_View SHALL display active courts as Court_Cards with player avatars, player names, star ratings, and numeric ratings in a team-vs-team layout.
2. THE Live_View SHALL display the player queue as a styled Queue_List with numbered positions, Player_Avatars, player names, star ratings, and W-L records.
3. THE Live_View SHALL display a session header area showing the session name, a "LIVE" badge with pulse animation, and the number of active courts and queued players.
4. THE Live_View SHALL use the same card-based design language (border radius, shadows, spacing) as the Organizer_Dashboard.
5. THE Live_View SHALL be fully responsive, stacking courts and queue vertically on mobile and displaying them side-by-side on tablet and desktop viewports.
6. THE Live_View SHALL display an "On Deck" indicator highlighting the next group of players who will be assigned to a court.
7. WHEN the session has ended, THE Live_View SHALL display the session-ended banner and leaderboard using the same card-based styling as the active view.
8. THE Live_View SHALL auto-refresh data on the existing 3-second polling interval without requiring manual page reload.

### Requirement 5: Dashboard UI Polish

**User Story:** As an organizer, I want the dashboard to look clean and professional with consistent spacing, icons, and player information displayed clearly, so that managing a session feels effortless.

#### Acceptance Criteria

1. THE Court_Card on the Organizer_Dashboard SHALL display player avatars and numeric ratings side-by-side with player names in the team layout.
2. THE Stats_Bar SHALL display each metric with a corresponding icon (person icon for players, checkmark for matches, percentage for win rate, star for rating, shuffle for pairing mode).
3. THE Queue_List on the Organizer_Dashboard SHALL display each player with a numbered position badge, Player_Avatar, player name, star rating icons, numeric rating, and W-L record in a single row.
4. THE Organizer_Dashboard SHALL use consistent spacing of `--space-md` (1rem) between major sections and `--space-sm` (0.5rem) between items within sections.
5. THE Organizer_Dashboard SHALL use the existing color scheme defined in CSS_Custom_Properties with the primary blue (`--color-primary`) for interactive elements, green (`--color-success`) for positive states, and amber (`--color-warning`) for attention states.
6. THE Court_Card SHALL display team sections with clear visual separation (a "VS" divider or distinct background areas) so that the two teams are immediately distinguishable.

### Requirement 6: Remove Live View Link from Ended Sessions

**User Story:** As an organizer, I want the live view link to disappear after a session ends, so that I am not confused by a link that no longer serves a purpose.

#### Acceptance Criteria

1. WHEN a session status is "ended", THE Organizer_Dashboard SHALL NOT display the Live_View URL text.
2. WHEN a session status is "ended", THE Organizer_Dashboard SHALL NOT display the "Copy" button for the Live_View URL.
3. WHEN a session status is "ended", THE Organizer_Dashboard SHALL NOT display the QR_Code for the Live_View URL.
4. WHILE a session status is "active", THE Organizer_Dashboard SHALL continue to display the Live_View URL, copy button, and QR_Code as specified in Requirement 2.

### Requirement 7: Single-Page Session Creation

**User Story:** As an organizer, I want to configure all session settings and check in players on a single page before the session is created, so that the setup flow is straightforward and I can review everything before committing.

#### Acceptance Criteria

1. THE Session_Creation_Page SHALL present all session configuration fields on a single page without using a modal dialog.
2. THE Session_Creation_Page SHALL organize fields into three visually distinct sections, each rendered as a card (with border radius, shadow, and padding consistent with the app's card-based design language): Basic_Info_Section, Game_Settings_Section, and Player_CheckIn_Section.
3. THE Basic_Info_Section SHALL contain inputs for session name (required, 1-50 characters), court name (optional, 0-50 characters), and number of courts (required, integer between 1 and 12).
4. THE Game_Settings_Section SHALL contain selectors for session type (open_play or tournament), game mode (doubles or singles), and matching mode (smart, queue, tournament, or skill_courts).
5. THE Player_CheckIn_Section SHALL allow the organizer to add players by entering a player name (1-30 characters) and selecting a star rating (1-5) before the session is created.
6. THE Player_CheckIn_Section SHALL display a list of all added players showing each player's name and star rating.
7. THE Player_CheckIn_Section SHALL allow the organizer to remove a player from the list before session creation.
8. THE Session_Creation_Page SHALL NOT create the session on the server until the organizer clicks the final submit button.
9. WHEN the organizer clicks the submit button, THE Session_Creation_Page SHALL validate all fields, create the session on the server with the configured settings, check in all added players, and navigate to the Organizer_Dashboard upon success.
10. IF session creation fails, THEN THE Session_Creation_Page SHALL display an error message and retain all entered data so the organizer can retry without re-entering information.
11. IF player check-in fails for one or more players after session creation, THEN THE Session_Creation_Page SHALL still navigate to the Organizer_Dashboard and display a warning indicating which players could not be checked in.
12. THE Session_Creation_Page SHALL NOT display the SessionSettingsModal at any point during the creation flow.
13. THE Session_Creation_Page SHALL provide default values for optional fields: session type defaults to "open_play", game mode defaults to "doubles", and matching mode defaults to "smart".
14. EACH section card SHALL display a section title and a brief informational description explaining the purpose of that section's settings.
15. EACH individual setting within a section SHALL display a descriptive helper text below or beside the input explaining what the setting controls and guiding the organizer on what to enter (e.g., "Give your session a name so players can find it easily", "Choose how many courts are available for play").

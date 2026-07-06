# Requirements Document

## Introduction

Session Settings & On Deck Queue upgrades the Picklestack app's session creation flow and match completion experience. Currently, session creation only captures a name and court count, and match completion only allows selecting a winning team. This feature introduces:

1. **Session Settings Modal** — a comprehensive settings modal shown after session creation that captures session type, game mode, matching mode, and court name in addition to the existing name and court count fields.
2. **Numeric Score Input** — replaces the binary "winning team" selection with actual game scores (e.g., 11-7) that are displayed in match history and factor into rating calculations.
3. **On Deck Queue Display** — a visible "On Deck" indicator showing which players are next to be matched, giving players clear visibility into when they'll play next.

These changes UPDATE the existing session creation flow rather than creating parallel systems.

## Glossary

- **App**: The Picklestack web application
- **Session**: A single open play event configured by an organizer
- **Organizer**: The person who creates and manages a session
- **Player**: A participant who checks into a session
- **Session_Settings_Modal**: A modal dialog displayed after session creation for configuring session parameters
- **Session_Type**: The format of the session, either "Tournament" or "Open Play"
- **Game_Mode**: The player count per match, either "Doubles" (4 players) or "Singles" (2 players)
- **Matching_Mode**: The algorithm used to assign players to courts: "Queue" (FIFO), "Smart Pairing" (skill-based), "Tournament" (bracket-style), or "Skill Courts" (courts grouped by skill level)
- **Court_Name**: An optional label for a specific court (e.g., "Court A", "Main Court")
- **Match_Score**: The numeric point totals for both teams in a completed match (e.g., 11-7, 21-15)
- **Score_Margin**: The absolute difference between the winning team's score and the losing team's score
- **On_Deck**: The set of players at the front of the Queue who will be assigned to the next available court
- **Queue**: An ordered list of players waiting to be assigned to a court

## Requirements

### Requirement 1: Session Settings Modal

**User Story:** As an organizer, I want to configure detailed session settings after creating a session, so that I can customize the play format for my group.

#### Acceptance Criteria

1. WHEN the Organizer creates a new Session, THE App SHALL display the Session_Settings_Modal immediately after the session is persisted and before navigating to the Organizer dashboard.
2. THE Session_Settings_Modal SHALL present input fields for: session name (pre-filled from creation), court name (optional text, 0-50 characters), Session_Type (selection between "Tournament" and "Open Play"), number of courts (pre-filled from creation, editable 1-12), Game_Mode (selection between "Doubles" and "Singles"), and Matching_Mode (selection between "Queue", "Smart Pairing", "Tournament", and "Skill Courts").
3. THE App SHALL default Session_Type to "Open Play", Game_Mode to "Doubles", and Matching_Mode to "Smart Pairing" when the Session_Settings_Modal is first displayed.
4. WHEN the Organizer confirms the Session_Settings_Modal, THE App SHALL persist all settings as part of the Session state and navigate to the Organizer dashboard.
5. THE App SHALL validate that session name is 1-50 characters after trimming, court count is 1-12, and court name (if provided) is 0-50 characters before persisting settings.
6. IF the Organizer submits the Session_Settings_Modal with invalid inputs, THEN THE App SHALL display inline validation errors for each invalid field and SHALL NOT persist the settings or navigate away.
7. THE App SHALL allow the Organizer to update session settings from the Organizer dashboard at any time while the Session is active.
8. WHEN Game_Mode is set to "Singles", THE App SHALL require 2 players per match instead of 4 players per match for all pairing and court assignment logic.

### Requirement 2: Player Check-In via Settings Modal

**User Story:** As an organizer, I want to add players directly from the session settings area, so that I can quickly check in players during setup.

#### Acceptance Criteria

1. THE Session_Settings_Modal SHALL include a player check-in section that allows the Organizer to add players by name and optional star rating.
2. WHEN the Organizer adds a player through the Session_Settings_Modal, THE App SHALL check in the player to the Session and add the player to the Queue, following the same validation rules as the existing check-in flow (name 1-30 characters, unique within session).
3. THE Session_Settings_Modal SHALL display the list of currently checked-in players with their star ratings.
4. IF the Organizer attempts to add a player with a duplicate name, THEN THE App SHALL display a validation error indicating the name is already in use.

### Requirement 3: Numeric Score Input

**User Story:** As an organizer, I want to input the actual game score when completing a match, so that score margins can be used in rating calculations and displayed in match history.

#### Acceptance Criteria

1. WHEN the Organizer completes a match, THE App SHALL prompt for numeric scores for both teams (Team 1 score and Team 2 score) instead of only selecting a winning team.
2. THE App SHALL determine the winning team automatically based on which team has the higher score.
3. THE App SHALL validate that both scores are non-negative integers and that the two scores are not equal.
4. IF the Organizer submits equal scores, THEN THE App SHALL display a validation error indicating that scores cannot be tied.
5. THE App SHALL continue to allow the Organizer to skip score recording by selecting a "Skip Score" option, in which case no Match_Score or Match_Result is recorded.
6. WHEN a Match_Score is recorded, THE App SHALL persist both team scores alongside the Match_Result.
7. THE App SHALL display the Match_Score (e.g., "11-7") in the match history view for each match where a score was recorded.
8. WHEN a Match_Score was skipped, THE App SHALL display "No Score" in the match history view for that match.
9. WHEN a Match_Score is recorded, THE App SHALL use the Score_Margin as a factor in the existing rating adjustment calculation, scaling the base rating points by a factor of (1 + Score_Margin / 20), capped at a maximum multiplier of 2.0.

### Requirement 4: On Deck Queue Display

**User Story:** As a player, I want to see who is "On Deck" (next to play), so that I know when my turn is coming and can prepare.

#### Acceptance Criteria

1. THE App SHALL display an "On Deck" section on both the Live_View and the Organizer dashboard that lists the players who will be assigned to the next available court.
2. WHEN the Session Game_Mode is "Doubles", THE App SHALL mark the first 4 players in the Queue as "On Deck". WHEN the Game_Mode is "Singles", THE App SHALL mark the first 2 players as "On Deck".
3. THE App SHALL display an "On Deck" text label or badge next to each player who is in the On_Deck group in the Queue list.
4. WHEN a match starts and players are removed from the Queue, THE App SHALL immediately update the On_Deck indicators to reflect the new front-of-queue players.
5. WHEN a match completes and players return to the Queue, THE App SHALL immediately update the On_Deck indicators to reflect the current queue state.
6. IF the Queue contains fewer players than required for a match (fewer than 4 for Doubles, fewer than 2 for Singles), THEN THE App SHALL mark all players in the Queue as "On Deck" and display a message indicating more players are needed.
7. THE App SHALL visually distinguish On_Deck players from other players in the Queue using a highlighted background color or border and the text "On Deck" displayed prominently.
8. WHEN the Matching_Mode is "Smart Pairing", THE App SHALL mark the first min(N, 8) players as the candidate pool and the text "On Deck" SHALL apply to all players in the candidate pool, since any of them may be selected for the next match.

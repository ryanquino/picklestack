# Requirements Document

## Introduction

Smart Match Scoring enhances the Picklestack pickleball queue management app with match result tracking, skill-based player pairing, and a full competitive experience. Currently, the system uses a strict FIFO approach — always taking the top 4 players from the queue — which leads to repetitive matchups and ignores skill differences. This feature introduces score recording, player ratings with star tiers, detailed statistics, match history, head-to-head records, player profile cards, win/loss streaks, and session achievements to create a fun, competitive atmosphere for both players and organizers.

## Glossary

- **App**: The Picklestack web application
- **Match_Result**: A record of the outcome of a completed match, including the winning team, losing team, and scores
- **Player_Rating**: A numeric value representing a player's skill level within a session, derived from match results
- **Star_Rating**: A visual tier (1-5 stars) derived from a Player's Player_Rating, displayed as star icons
- **Pairing_Algorithm**: The logic that selects and groups players from the queue into balanced teams for a match
- **Team**: A pair of 2 players assigned to the same side of a match
- **Win_Rate**: The ratio of matches won to total matches played by a player within a session
- **Skill_Gap**: The absolute difference in Player_Rating between two teams in a proposed matchup
- **Candidate_Pool**: The set of players from the front of the queue considered for pairing by the Pairing_Algorithm
- **Streak**: A consecutive sequence of wins or losses by a Player within a Session
- **Head_to_Head**: The win-loss record between two specific Players across all matches they have played against each other in a Session
- **Player_Profile**: A detailed view of a Player's statistics, match history, and achievements within a Session
- **Achievement**: A badge awarded to a Player for reaching specific milestones during a Session
- **MVP**: The Player with the highest Win_Rate among Players who have played 3 or more matches in a Session
- **Session**: A single open play event configured by an organizer with a set number of courts and players
- **Organizer**: The person who creates and manages a session, controls the queue, and assigns courts
- **Player**: A participant who checks into a session and waits in the queue for court assignment
- **Queue**: An ordered list of players waiting to be assigned to a court for their next game
- **Match**: A single game played on a court by an assigned group of players (4 for doubles)

## Requirements

### Requirement 1: Match Score Recording

**User Story:** As an organizer, I want to record the score of a completed match, so that player performance can be tracked and used for future matchmaking.

#### Acceptance Criteria

1. WHEN the Organizer completes a match, THE App SHALL prompt the Organizer to designate which team won by selecting either Team 1 (players 1 and 2 from the match assignment) or Team 2 (players 3 and 4 from the match assignment).
2. WHEN the Organizer submits a Match_Result with a winning team designation, THE App SHALL persist the Match_Result including the winning team player IDs, losing team player IDs, and completion timestamp, and SHALL return all non-removed players from the match to the end of the Queue in their original assignment order.
3. THE App SHALL allow the Organizer to complete a match without recording a score by selecting a "Skip Score" option, in which case the match is marked completed, no Match_Result is recorded, and all non-removed players are returned to the end of the Queue in their original assignment order.
4. IF the Organizer submits a match completion without selecting a winning team and without selecting "Skip Score", THEN THE App SHALL display a validation error indicating that a winner must be selected or the score must be skipped, and SHALL preserve the match in its active state.
5. WHEN a Match_Result has been recorded, THE App SHALL allow the Organizer to update the winning team designation for that match until the Session is ended.
6. IF a Match_Result is submitted for a match where all players have been removed from the Session, THEN THE App SHALL still persist the Match_Result with the original player IDs from the match assignment.

### Requirement 2: Player Rating Calculation

**User Story:** As an organizer, I want player skill ratings to be automatically calculated from match results, so that the system can form balanced matchups.

#### Acceptance Criteria

1. THE App SHALL assign each Player an initial Player_Rating based on their self-assessed Star_Rating at check-in: 1 star → 400, 2 stars → 700, 3 stars → 1000, 4 stars → 1300, 5 stars → 1600. IF no Star_Rating is provided, THE App SHALL default to 1000.
2. WHEN a Match_Result is recorded, THE App SHALL update the Player_Rating for each Player in the match using a base adjustment of 16 points: winning team players gain points and losing team players lose points, scaled by the difference between the two teams' average ratings.
3. THE App SHALL scale rating adjustments such that the expected adjustment equals base points (16) multiplied by a factor between 0.5 and 1.5, where wins against a team with a higher average rating yield a factor above 1.0 and wins against a team with a lower average rating yield a factor below 1.0, with the factor capped at the range bounds.
4. THE App SHALL constrain Player_Rating to a minimum value of 100 and a maximum value of 3000.
5. IF a Player has played zero matches in the Session, THEN THE App SHALL use the Player's initial Player_Rating (derived from self-assessment) for pairing purposes.

### Requirement 3: Skill-Based Player Pairing

**User Story:** As an organizer, I want the system to form balanced matchups using player ratings, so that games are competitive and fair.

#### Acceptance Criteria

1. WHEN the Organizer starts a match on a court, THE App SHALL select 4 players from the Candidate_Pool and assign them to the court using the Pairing_Algorithm instead of strict FIFO order.
2. THE App SHALL define the Candidate_Pool as the first 8 players in the Queue, or all players in the Queue if fewer than 8 are available (minimum 4 required to start a match).
3. THE Pairing_Algorithm SHALL evaluate all possible selections of 4 players from the Candidate_Pool and all possible team splits of those 4 into two teams of 2, and SHALL choose the combination that produces the minimum Skill_Gap between the two teams' average Player_Ratings.
4. WHEN multiple team combinations produce the same minimum Skill_Gap, THE Pairing_Algorithm SHALL prefer the combination where the selected players have been on the same team together least frequently during the Session.
5. IF multiple team combinations remain tied after applying the Skill_Gap and same-team frequency tiebreakers, THEN THE Pairing_Algorithm SHALL select the combination that includes the player with the earliest (lowest) Queue position.
6. WHEN the Candidate_Pool contains only players with no match history (all ratings are 1000), THE Pairing_Algorithm SHALL select 4 players randomly from the Candidate_Pool.
7. IF the Queue contains fewer than 4 players when the Organizer attempts to start a match, THEN THE App SHALL display a validation error indicating that at least 4 players are required in the queue.
8. THE App SHALL remove the 4 selected players from the Queue, re-number remaining Queue positions starting from 0, and display the assigned players on the court.

### Requirement 4: Matchup Variety

**User Story:** As a player, I want to play with and against different people throughout the session, so that the experience stays fresh and social.

#### Acceptance Criteria

1. THE Pairing_Algorithm SHALL track how many times each pair of players has been on the same team during the Session.
2. THE Pairing_Algorithm SHALL track how many times each pair of players has been opponents during the Session.
3. WHEN forming teams, THE Pairing_Algorithm SHALL not select a team combination where any pair of players has been teammates more than 2 times during the Session, unless all possible team combinations from the Candidate_Pool exceed this threshold.
4. WHEN selecting opponents, THE Pairing_Algorithm SHALL not select a matchup where the same 4 players have faced each other in the same team configuration more than once during the Session, unless all possible matchups from the Candidate_Pool exceed this threshold.
5. IF all possible team combinations from the Candidate_Pool exceed the teammate repetition threshold, THEN THE Pairing_Algorithm SHALL select the combination with the lowest maximum teammate count among its player pairs.

### Requirement 5: Player Statistics Display

**User Story:** As a player, I want to see my match statistics on the live view, so that I can track my performance during the session.

#### Acceptance Criteria

1. THE App SHALL display each Player's win count, loss count, total matches played, and Win_Rate (formatted as a whole-number percentage, e.g., "67%") on the Live_View.
2. THE App SHALL display each Player's current Star_Rating (1-5 stars) and Player_Rating (formatted as a whole number) on the Live_View.
3. THE App SHALL display each Player's current Streak (e.g., "🔥 3W" for 3 consecutive wins, or "❄️ 2L" for 2 consecutive losses) on the Live_View. IF the Player has no streak (0 matches or alternating results), THEN no streak indicator SHALL be displayed.
4. WHEN a Match_Result is recorded, THE App SHALL update the displayed statistics for all Players in that match within 5 seconds.
5. THE App SHALL display Player statistics adjacent to the Player's name in both the Queue list and the active Match display on the Live_View.
6. IF a Player has played zero matches in the Session, THEN THE App SHALL display the Player's statistics as 0 wins, 0 losses, 0 matches played, a Win_Rate of 0%, a Star_Rating of 3 stars (default), and a Player_Rating of 1000.
7. THE App SHALL highlight the current MVP (highest Win_Rate among Players with 3+ matches) with a visible "MVP" badge on the Live_View. IF no Player has played 3 or more matches, THEN no MVP badge SHALL be displayed.

### Requirement 8: Star Rating Tiers

**User Story:** As a player, I want to self-rate my skill level at check-in and see it evolve based on my performance, so that matchups start balanced and I can track my progression.

#### Acceptance Criteria

1. WHEN the Organizer checks in a Player, THE App SHALL prompt for a self-assessed Star_Rating of 1 to 5 stars (labeled as: 1 = Beginner, 2 = Novice, 3 = Intermediate, 4 = Advanced, 5 = Expert).
2. THE App SHALL map the self-assessed Star_Rating to an initial Player_Rating: 1 star → 400, 2 stars → 700, 3 stars → 1000, 4 stars → 1300, 5 stars → 1600.
3. IF the Organizer does not select a Star_Rating during check-in, THE App SHALL default to 3 stars (Intermediate, Player_Rating of 1000).
4. THE App SHALL derive the displayed Star_Rating from the Player's current Player_Rating using the following thresholds: 1 star (100-599), 2 stars (600-899), 3 stars (900-1099), 4 stars (1100-1399), 5 stars (1400+).
5. THE App SHALL display the Star_Rating as filled star icons (★) next to the Player's name on both the Live_View and the Organizer dashboard.
6. WHEN a Player's Player_Rating changes after a Match_Result, THE App SHALL recalculate and update the displayed Star_Rating immediately based on the current thresholds.
7. THE Pairing_Algorithm SHALL use the Player's current Player_Rating (which incorporates the self-assessed starting point) for all matchmaking calculations.

### Requirement 9: Match History

**User Story:** As a player, I want to see my match history during the session, so that I can review my past games and track my progression.

#### Acceptance Criteria

1. THE App SHALL maintain a chronological list of all matches a Player has participated in during the Session, including the match court number, teammates, opponents, result (win/loss/skipped), and timestamp.
2. THE App SHALL display the Player's match history in reverse chronological order (most recent first) on the Player_Profile.
3. WHEN a match result is "skipped" (no score recorded), THE App SHALL display the match in the history with a "No Score" indicator instead of win/loss.
4. THE App SHALL display a maximum of the 20 most recent matches in the match history view, with an indication of total matches played if more than 20 exist.

### Requirement 10: Head-to-Head Records

**User Story:** As a player, I want to see my record against specific opponents, so that I know how I've performed against them historically in this session.

#### Acceptance Criteria

1. THE App SHALL track the win-loss record between every pair of Players who have been opponents during the Session.
2. WHEN the Pairing_Algorithm assigns players to a match, THE App SHALL display the Head_to_Head record between opposing team members on the court card (e.g., "Alice vs Bob: 2-1").
3. THE App SHALL display Head_to_Head records on the Player_Profile showing all opponents the Player has faced, sorted by number of encounters (descending).
4. THE App SHALL only count matches where a Match_Result was recorded (not skipped) toward Head_to_Head records.

### Requirement 11: Player Profile Card

**User Story:** As a player, I want to tap on a player's name to see their full stats and match history, so that I can get a detailed view of any player's performance.

#### Acceptance Criteria

1. WHEN a user taps or clicks a Player's name on the Live_View or Organizer dashboard, THE App SHALL display a Player_Profile card as a modal overlay.
2. THE Player_Profile card SHALL display: Player name, Star_Rating, Player_Rating, win count, loss count, total matches played, Win_Rate, current Streak, match history (most recent 10 matches), Head_to_Head records against opponents, and any earned Achievements.
3. THE App SHALL allow the user to dismiss the Player_Profile card by tapping outside it, pressing Escape, or tapping a close button.
4. THE Player_Profile card SHALL be accessible on both the Live_View (read-only for players) and the Organizer dashboard.

### Requirement 12: Session Achievements

**User Story:** As a player, I want to earn fun achievements during the session, so that the experience feels rewarding and competitive beyond just winning.

#### Acceptance Criteria

1. THE App SHALL award the following Achievements to Players during a Session:
   - "Iron Player" — awarded to the Player who has played the most matches in the Session (minimum 5 matches required).
   - "Undefeated" — awarded to any Player who has won all of their matches and played at least 3 matches.
   - "Hot Streak" — awarded to any Player who achieves a win streak of 5 or more consecutive wins.
   - "Comeback King" — awarded to any Player who wins a match after losing 2 or more consecutive matches.
   - "Social Butterfly" — awarded to any Player who has been teammates with at least 6 different Players during the Session.
2. THE App SHALL evaluate Achievement criteria after each Match_Result is recorded and award newly earned Achievements immediately.
3. THE App SHALL display earned Achievements as badge icons on the Player's name in the Queue list, active Match display, and Player_Profile.
4. THE App SHALL display a notification on the Organizer dashboard when a Player earns a new Achievement.
5. WHEN a Session is ended, THE App SHALL include all earned Achievements in the session summary leaderboard next to each Player's statistics.
6. THE "Iron Player" Achievement SHALL be re-evaluated after each match and may transfer to a different Player if another Player surpasses the current holder's match count.

### Requirement 6: Organizer Pairing Override

**User Story:** As an organizer, I want the option to override the smart pairing and use the original FIFO order, so that I have flexibility when the algorithm isn't appropriate.

#### Acceptance Criteria

1. THE App SHALL provide a toggle on the Organizer dashboard to switch between "Smart Pairing" mode and "Queue Order" mode, displaying the currently active mode to the Organizer.
2. WHILE the Session is in "Queue Order" mode, THE App SHALL assign the top 4 players from the Queue in strict FIFO order when a match is started, matching the original behavior.
3. WHILE the Session is in "Smart Pairing" mode, THE App SHALL use the Pairing_Algorithm to select and assign players when a match is started.
4. THE App SHALL default new Sessions to "Smart Pairing" mode and persist the selected pairing mode as part of the Session state so that it is retained across page reloads.
5. WHEN the Organizer toggles the pairing mode, THE App SHALL apply the new mode to the next match started, leaving all active matches in progress unaffected and preserving the current Queue order and player positions.

### Requirement 7: Session Summary with Statistics

**User Story:** As an organizer, I want the session summary to include player performance data, so that I can review how the session went.

#### Acceptance Criteria

1. WHEN a Session is ended, THE App SHALL include in the session summary a leaderboard showing all Players ranked by Win_Rate (descending), with ties broken by total matches played (descending), and any remaining ties broken by Player name in alphabetical order (ascending).
2. THE App SHALL display each Player's Star_Rating, final Player_Rating, win count, loss count, total matches played, Win_Rate as a percentage rounded to one decimal place (e.g., "66.7%"), and earned Achievements in the session summary leaderboard.
3. WHEN a Player has played zero matches during the Session, THE App SHALL include that Player in the leaderboard with a Star_Rating of 3 stars, a Player_Rating of 1000, 0 wins, 0 losses, 0 total matches played, and a Win_Rate of "0.0%".
4. WHEN a Player opens the Live_View of an ended Session, THE App SHALL display the session summary leaderboard alongside the existing session-ended message.
5. WHEN the Organizer opens the Organizer dashboard of an ended Session, THE App SHALL display the session summary leaderboard alongside the existing session-ended information.
6. THE session summary SHALL highlight the MVP, "Iron Player", and any "Undefeated" Players with special visual treatment in the leaderboard.

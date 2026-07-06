# Requirements Document

## Introduction

Session Intelligence adds four per-session analytics and intelligence features to PickleStack that enhance the open play experience within a single 4-hour session (typically 6-8 games per player). These features give organizers real-time insight into session health and give players visibility into their queue status and matchup variety. The features are: Matchup Diversity Score, Session Pace Dashboard, "Next Game" Countdown & Notifications, and Match Quality Score (Post-Game).

## Glossary

- **Diversity_Engine**: The backend service component that computes matchup diversity metrics for each player in a session based on unique opponents and teammates faced versus total possible.
- **Pace_Dashboard**: The organizer-facing UI component that displays real-time session pacing projections based on match duration, queue depth, and court count.
- **Queue_Estimator**: The backend service component that calculates estimated wait time for queued players based on average match duration and queue position.
- **Quality_Scorer**: The backend service component that computes match quality ratings for individual matches and aggregates them into a session-level quality metric.
- **Organizer**: The user who created and manages the session, with access to the organizer dashboard.
- **Player**: A participant checked into the session who plays matches and waits in the queue.
- **Unique_Opponent_Count**: The number of distinct players a given player has faced as an opponent during the session.
- **Unique_Teammate_Count**: The number of distinct players a given player has been paired with as a teammate during the session.
- **Total_Possible_Opponents**: The total number of other players checked into the session minus one (the player themselves).
- **Average_Match_Duration**: The rolling mean of completed match durations (start to completion) within the current session.
- **Queue_Depth**: The current number of players waiting in the queue.
- **Court_Count**: The number of courts configured for the session.
- **Match_Quality_Rating**: A normalized score (0-100) reflecting how competitive, fresh, and balanced a completed match was.
- **Session_Quality_Score**: The mean of all Match_Quality_Rating values for the session.
- **Score_Closeness**: A metric derived from the absolute difference between team scores in a completed match, where smaller differences yield higher closeness values.
- **Rating_Gap**: The absolute difference between the average Elo ratings of the two teams in a match.
- **Fresh_Matchup**: A match where the exact 4-player team configuration has not occurred previously in the session.
- **Pacing_Projection**: The estimated total number of games each player will get by session end, calculated from Average_Match_Duration, Queue_Depth, and Court_Count.

## Requirements

### Requirement 1: Compute Matchup Diversity Score

**User Story:** As a player, I want to see what percentage of other session participants I have played with or against, so that I know whether I am getting a varied experience.

#### Acceptance Criteria

1. WHEN a match completes, THE Diversity_Engine SHALL recompute the diversity percentage for each player involved in that match using the formula: `(Unique_Opponent_Count + Unique_Teammate_Count) / (2 × Total_Possible_Opponents) × 100`, rounded to the nearest integer, where Total_Possible_Opponents equals the total number of checked-in players in the session minus one.
2. THE Diversity_Engine SHALL count each distinct opponent exactly once regardless of how many times the player has faced that opponent.
3. THE Diversity_Engine SHALL count each distinct teammate exactly once regardless of how many times the player has been paired with that teammate.
4. WHEN a new player checks into the session, THE Diversity_Engine SHALL set that player's diversity percentage to 0.
5. WHEN a new player checks into the session, THE Diversity_Engine SHALL recalculate Total_Possible_Opponents for all existing players to include the new player.
6. IF Total_Possible_Opponents is zero (only one player in the session), THEN THE Diversity_Engine SHALL set the diversity percentage to 0 and skip the formula calculation.
7. THE Diversity_Engine SHALL allow a player to appear in both the unique opponent set and the unique teammate set simultaneously if that player has been both a teammate and an opponent across different matches.

### Requirement 2: Display Matchup Diversity in Player UI

**User Story:** As a player, I want to see my diversity percentage displayed prominently, so that I can track how many unique people I have played with during the session.

#### Acceptance Criteria

1. WHILE a session is active, THE Player_Profile_Card SHALL display the player's current diversity percentage as "Diversity: X%" where X is the integer-rounded percentage of unique opponents and teammates faced out of total other players in the session.
2. WHILE a session is active, THE Queue_List SHALL display each queued player's diversity percentage next to their name in the format "X%".
3. IF the player has completed zero matches in the session, THEN THE Player_Profile_Card SHALL display "Diversity: 0%".
4. IF the diversity percentage is below 50%, THEN THE Player_Profile_Card SHALL display the diversity value in amber color.
5. IF the diversity percentage is 50% or above, THEN THE Player_Profile_Card SHALL display the diversity value in green color.
6. WHEN a match completes that includes the player, THE Player_Profile_Card SHALL update the displayed diversity percentage within 5 seconds without requiring a manual page refresh.

### Requirement 3: Boost Diversity in Smart Pairing

**User Story:** As a player, I want the smart pairing algorithm to prioritize matching me with people I haven't played with yet, so that in a short 6-8 game session I meet as many different people as possible.

#### Acceptance Criteria

1. WHILE pairing mode is set to "smart", THE Pairing_Algorithm SHALL include a diversity bonus in the combination scoring that favors groupings where players have not previously faced each other, applied as a tiebreaker after skill gap and before teammate frequency sum.
2. THE Pairing_Algorithm SHALL calculate the diversity bonus for a candidate grouping as the count of fresh opponent pairings among the selected players divided by the maximum possible fresh pairings (6 for a 4-player doubles grouping, 1 for a 2-player singles grouping), producing a value between 0.0 and 1.0 inclusive.
3. WHEN two candidate groupings have equal skill gap scores, THE Pairing_Algorithm SHALL prefer the grouping with the higher diversity bonus; if diversity bonuses are also equal, the algorithm SHALL fall through to the teammate frequency sum tiebreaker followed by earliest queue position.
4. THE Pairing_Algorithm SHALL NOT override the teammate repetition threshold filter or the exact matchup repetition filter; both filters SHALL be applied before the diversity bonus is evaluated.
5. IF all candidate groupings have a diversity bonus of 0.0 (no fresh opponent pairings exist among any combination), THEN THE Pairing_Algorithm SHALL skip the diversity bonus tiebreaker and proceed to the teammate frequency sum tiebreaker.

### Requirement 4: Session Pace Dashboard

**User Story:** As an organizer, I want to see a real-time pacing indicator showing projected games per player, so that I can decide whether to adjust game-to scores or speed up rotations.

#### Acceptance Criteria

1. WHILE a session is active, THE Pace_Dashboard SHALL display the current Average_Match_Duration in minutes and seconds, computed as the arithmetic mean of all completed match durations in the session (completedAt minus startedAt), rounded to the nearest second.
2. WHILE a session is active, THE Pace_Dashboard SHALL display the Pacing_Projection as "At current pace, each player will get ~N games" where N is the projected games per player rounded to the nearest integer.
3. THE Pace_Dashboard SHALL calculate Pacing_Projection using the formula: `remaining_time_minutes / Average_Match_Duration × Court_Count / ceil(Queue_Depth / Players_Per_Match)`, where remaining_time_minutes is (session creation time + 240 minutes) minus the current time, Queue_Depth is the total number of checked-in players (including those currently on court), and Players_Per_Match is 4 for doubles or 2 for singles based on the session's game mode.
4. IF fewer than 2 matches have been completed in the session, THEN THE Pace_Dashboard SHALL display "Not enough data yet" instead of a projection.
5. WHEN the Pacing_Projection drops below 6 games per player, THE Pace_Dashboard SHALL display a warning indicator with the message "⚠️ Games are running long — players may only get N games at this rate."
6. WHILE a session is active, THE Pace_Dashboard SHALL update the projection each time the organizer dashboard polls for new state.
7. IF remaining_time_minutes is zero or negative, THEN THE Pace_Dashboard SHALL display a Pacing_Projection of 0 and show the warning indicator.
8. IF Queue_Depth is zero, THEN THE Pace_Dashboard SHALL display "No players checked in" instead of a projection.

### Requirement 5: Compute Estimated Wait Time for Queued Players

**User Story:** As a player waiting in the queue, I want to see how many minutes until my next game, so that I can plan my break time during a session where I only play 7 games total.

#### Acceptance Criteria

1. WHEN a player is in the queue and at least 2 matches have been completed in the session, THE Queue_Estimator SHALL calculate the estimated wait time as `(queue_position / (Court_Count × Players_Per_Match)) × Average_Match_Duration`, where queue_position is the player's 1-based position in the queue, Players_Per_Match is 4 for doubles mode or 2 for singles mode, and Average_Match_Duration is the arithmetic mean duration in minutes of all completed matches in the current session (computed from each match's started_at to completed_at).
2. IF fewer than 2 matches have been completed in the current session, THEN THE Queue_Estimator SHALL return no estimate (null) for all queued players.
3. WHEN a match is completed or a player's queue position changes, THE Queue_Estimator SHALL recalculate the estimated wait time for all affected queued players.
4. THE Queue_Estimator SHALL round the estimated wait time to the nearest whole minute, with a minimum displayed value of 1 minute for any player in the queue who receives an estimate.
5. IF the computed Average_Match_Duration is zero (e.g., all completed matches were force-completed instantly), THEN THE Queue_Estimator SHALL return no estimate (null).

### Requirement 6: Display Next Game Countdown

**User Story:** As a player in the queue, I want to see a countdown showing when I am expected to play next, so that I feel informed rather than anxious about wait times.

#### Acceptance Criteria

1. WHILE a player is in the queue and the Queue_Estimator returns a non-null estimate, THE Queue_List SHALL display "You're up in ~N min" next to the player's queue entry, where N is the estimated wait time in whole minutes.
2. WHEN the estimated wait time is less than 2 minutes, THE Queue_List SHALL display "You're up next!" instead of the minute count.
3. WHILE a player is in the queue and the Queue_Estimator returns null (fewer than 2 completed matches or zero average duration), THE Queue_List SHALL display no countdown text.
4. WHILE a session is active, THE Live_View SHALL display each queued player's estimated wait time using the same format as the Queue_List.

### Requirement 7: Compute Match Quality Score

**User Story:** As an organizer, I want each completed match to receive a quality rating, so that I can understand whether the smart pairing is creating good games.

#### Acceptance Criteria

1. WHEN a match completes with scores recorded, THE Quality_Scorer SHALL compute the Match_Quality_Rating as a weighted sum of three components: Score_Closeness_Score (40% weight), Rating_Balance_Score (35% weight), and Freshness_Score (25% weight), and round the result to the nearest integer.
2. THE Quality_Scorer SHALL calculate Score_Closeness_Score as `max(0, 100 - (score_difference × 10))` where score_difference is the absolute difference between team1 and team2 scores.
3. THE Quality_Scorer SHALL calculate Rating_Balance_Score as `max(0, 100 - Rating_Gap)` where Rating_Gap is the absolute difference between the average ratings of the two teams; IF a player has no established rating, THEN THE Quality_Scorer SHALL use the session's default initial rating (1000) for that player in the calculation.
4. THE Quality_Scorer SHALL calculate Freshness_Score as 100 when the match is a Fresh_Matchup, and 50 when the exact team configuration (same two pairs, regardless of which pair is labeled team1 or team2) has occurred before in the session.
5. THE Quality_Scorer SHALL clamp the final Match_Quality_Rating to the range 0-100 inclusive.
6. WHEN a match completes without scores recorded (winner-only result), THE Quality_Scorer SHALL compute the Match_Quality_Rating using only Rating_Balance_Score (60% weight) and Freshness_Score (40% weight), and round the result to the nearest integer.

### Requirement 8: Display Session Quality Metrics

**User Story:** As an organizer, I want to see an aggregate quality metric for the session, so that I can evaluate whether smart pairing is working well for my group.

#### Acceptance Criteria

1. WHILE a session is active and at least one match has a Match_Quality_Rating, THE Organizer_Dashboard SHALL display the Session_Quality_Score as "Session Quality: X/100" where X is the score rounded to the nearest integer.
2. WHILE the Session_Quality_Score is 70 or above, THE Organizer_Dashboard SHALL display the score with a positive visual indicator (green).
3. WHILE the Session_Quality_Score is between 40 and 69 inclusive, THE Organizer_Dashboard SHALL display the score with a neutral visual indicator (amber).
4. WHILE the Session_Quality_Score is below 40, THE Organizer_Dashboard SHALL display the score with a negative visual indicator (red).
5. WHILE a session is active, THE Organizer_Dashboard SHALL display up to the most recent 3 match quality ratings in a compact list showing court number and score; IF fewer than 3 matches have ratings, THEN THE Organizer_Dashboard SHALL display only the available rated matches.
6. WHEN the session ends, THE Session_Summary SHALL include the final Session_Quality_Score rounded to the nearest integer and total matches rated.
7. WHEN the session ends and no matches have a Match_Quality_Rating, THE Session_Summary SHALL display the Session_Quality_Score as "N/A" and total matches rated as 0.
8. WHEN a match completes with a Match_Quality_Rating, THE Organizer_Dashboard SHALL update the displayed Session_Quality_Score and recent match list on the next state poll.

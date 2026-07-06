# Requirements Document

## Introduction

This feature adds the ability for an organizer to "lock" two players as permanent teammates for the duration of a session. Locked pairs always play on the same team, occupy a single slot in the queue, and are treated as a unit by the pairing algorithm. Their combined average rating is used for skill-based matchmaking.

## Glossary

- **Organizer**: The user who creates and manages a session
- **Fixed_Pair**: Two players locked together as permanent teammates for the session
- **Pair_Slot**: A single queue position occupied by a Fixed_Pair, representing both players as one unit
- **Pairing_Service**: The server-side service responsible for selecting players and forming teams for matches
- **Queue_Service**: The server-side service responsible for managing the player queue
- **Combined_Rating**: The average of both players' individual ratings within a Fixed_Pair, used for matchmaking
- **Session**: An active open play event managed by an Organizer
- **Queue**: The ordered list of players and pairs waiting to be assigned to a court

## Requirements

### Requirement 1: Create a Fixed Pair

**User Story:** As an organizer, I want to lock two queued players as permanent teammates, so that they always play together for the rest of the session.

#### Acceptance Criteria

1. WHEN the Organizer selects two players from the queue and confirms pairing, THE Queue_Service SHALL create a Fixed_Pair linking those two players for the session
2. WHEN a Fixed_Pair is created, THE Queue_Service SHALL remove both players' individual queue entries and insert a single Pair_Slot at the earlier of the two original queue positions
3. WHEN a Fixed_Pair is created, THE Queue_Service SHALL re-number all remaining queue positions from 0 preserving relative order
4. IF the Organizer attempts to pair a player who is already part of a Fixed_Pair, THEN THE Queue_Service SHALL return a validation error indicating the player is already paired
5. IF the Organizer attempts to pair a player who is currently in an active match, THEN THE Queue_Service SHALL return a validation error indicating the player is unavailable
6. IF the session has ended, THEN THE Queue_Service SHALL return a validation error indicating the session is no longer active

### Requirement 2: Queue Behavior for Fixed Pairs

**User Story:** As an organizer, I want fixed pairs to behave as a single unit in the queue, so that queue management remains simple and predictable.

#### Acceptance Criteria

1. THE Queue_Service SHALL display a Fixed_Pair as a single entry in the queue showing both player names
2. WHEN the Organizer moves a Pair_Slot up or down in the queue, THE Queue_Service SHALL move both players together as one unit
3. WHEN the Organizer removes a Pair_Slot from the queue, THE Queue_Service SHALL remove both players from the session and dissolve the Fixed_Pair
4. WHEN a match completes and players return to the queue, THE Queue_Service SHALL re-insert a Fixed_Pair as a single Pair_Slot at the end of the queue

### Requirement 3: Pairing Algorithm Integration

**User Story:** As an organizer, I want the pairing algorithm to treat fixed pairs as indivisible units, so that locked teammates are never split across opposing teams.

#### Acceptance Criteria

1. WHEN the Pairing_Service selects players for a doubles match, THE Pairing_Service SHALL treat each Fixed_Pair as a single candidate occupying one team slot
2. WHEN a Fixed_Pair is selected for a match, THE Pairing_Service SHALL place both players on the same team
3. WHEN calculating skill gap for matchmaking, THE Pairing_Service SHALL use the Combined_Rating (average of both players' individual ratings) as the pair's effective rating
4. WHEN building the candidate pool in smart mode, THE Pairing_Service SHALL include Fixed_Pairs alongside individual players, selecting up to 4 team slots (where a pair counts as one slot)
5. WHEN operating in queue (FIFO) mode, THE Pairing_Service SHALL select candidates by queue position treating each Pair_Slot as a single position

### Requirement 4: Dissolve a Fixed Pair

**User Story:** As an organizer, I want to unlock a fixed pair, so that the two players return to being independent participants.

#### Acceptance Criteria

1. WHEN the Organizer dissolves a Fixed_Pair that is in the queue, THE Queue_Service SHALL remove the Pair_Slot and insert two individual queue entries at consecutive positions starting at the original Pair_Slot position
2. WHEN a Fixed_Pair is dissolved, THE Queue_Service SHALL re-number all remaining queue positions from 0 preserving relative order
3. IF the Organizer attempts to dissolve a Fixed_Pair while both players are in an active match, THEN THE Queue_Service SHALL return a validation error indicating the pair cannot be dissolved during a match
4. WHEN a session ends, THE Queue_Service SHALL automatically dissolve all Fixed_Pairs in that session

### Requirement 5: Fixed Pair Constraints

**User Story:** As an organizer, I want clear constraints on fixed pairs, so that the system remains fair and functional.

#### Acceptance Criteria

1. THE Queue_Service SHALL allow a maximum of one Fixed_Pair per player per session
2. THE Queue_Service SHALL require both players to be checked into the same session before creating a Fixed_Pair
3. WHEN a player is removed from the session individually (not via Pair_Slot removal), THE Queue_Service SHALL dissolve any Fixed_Pair that player belongs to and return the remaining partner as an individual queue entry at the Pair_Slot's original position
4. THE Pairing_Service SHALL require at least 2 team slots in the queue to start a doubles match (where a Fixed_Pair counts as one team slot and two individual players count as two team slots)

### Requirement 6: Display Fixed Pairs in UI

**User Story:** As an organizer, I want to visually distinguish fixed pairs in the queue and on courts, so that I can easily see which players are locked together.

#### Acceptance Criteria

1. THE Queue_Service SHALL return a flag indicating whether a queue entry is a Pair_Slot or an individual player
2. WHEN displaying the queue, THE Client SHALL render a Pair_Slot with a visual indicator (link icon) showing the two players are locked together
3. WHEN displaying an active match, THE Client SHALL indicate which players on a team are part of a Fixed_Pair
4. THE Client SHALL provide a UI control for the Organizer to create a Fixed_Pair from two selected queue entries
5. THE Client SHALL provide a UI control for the Organizer to dissolve an existing Fixed_Pair

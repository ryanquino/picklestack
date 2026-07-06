# Requirements Document

## Introduction

Picklestack is a web application for managing pickleball open play sessions. It provides a queueing system that allows organizers to check players in, rotate courts fairly, and give players real-time visibility into the queue from their own devices. Phase 1 focuses on the core queue management functionality: session setup, player check-in, queue ordering, court assignment, and a live player-facing view.

## Glossary

- **Session**: A single open play event configured by an organizer with a set number of courts and players
- **Organizer**: The person who creates and manages a session, controls the queue, and assigns courts
- **Player**: A participant who checks into a session and waits in the queue for court assignment
- **Queue**: An ordered list of players waiting to be assigned to a court for their next game
- **Court**: A numbered pickleball court available for play during a session
- **Match**: A single game played on a court by an assigned group of players (typically 4 for doubles)
- **Check_In**: The act of an organizer adding a player to the active session roster
- **Rotation**: The process of moving players from completed matches back into the queue and assigning queued players to open courts
- **Live_View**: A read-only, player-facing page showing current queue state, active matches, and up-next information
- **App**: The Picklestack web application

## Requirements

### Requirement 1: Session Creation

**User Story:** As an organizer, I want to create a new open play session with a specified number of courts, so that I can begin managing player rotation.

#### Acceptance Criteria

1. WHEN the Organizer submits a valid session form with a session name and court count, THE App SHALL create a Session and display the organizer dashboard for that Session. IF the dashboard fails to display, THE App SHALL still persist the created Session.
2. THE App SHALL require a session name that is between 1 and 50 characters in length (after trimming leading and trailing whitespace) and a court count that is a whole number between 1 and 12 inclusive for Session creation.
3. WHEN a Session is created, THE App SHALL generate a unique shareable URL for the Live_View of that Session.
4. IF the Organizer submits the session form with an invalid session name or an invalid court count, THEN THE App SHALL display a validation error indicating which field is invalid, preserve the Organizer's entered values, remain on the session form, and prevent Session creation.

### Requirement 2: Player Check-In

**User Story:** As an organizer, I want to check players into the session, so that they are added to the queue and can be assigned to courts.

#### Acceptance Criteria

1. WHEN the Organizer enters a player name and submits the check-in form, THE App SHALL add the Player to the Session roster and place the Player at the end of the Queue.
2. THE App SHALL require a player name that contains at least 1 non-whitespace character and is at most 30 characters in length for Check_In.
3. IF the Organizer attempts to check in a Player with a name that matches an existing Player name in the Session using case-insensitive comparison, THEN THE App SHALL display a duplicate name error, preserve the entered name in the form, and prevent the Check_In.
4. WHEN a Player is checked in, THE App SHALL display the Player in the Queue with their current position number.
5. IF the Organizer submits the check-in form with an invalid player name, THEN THE App SHALL display a validation error indicating the name requirement and prevent the Check_In.

### Requirement 3: Queue Management

**User Story:** As an organizer, I want to manage the player queue, so that I can control the order of play and handle players leaving or arriving.

#### Acceptance Criteria

1. THE App SHALL display the Queue as an ordered list showing each Player's position (starting from 0) and name.
2. WHEN the Organizer moves a Player up or down in the Queue, THE App SHALL reorder existing Players without duplication and update all position numbers to reflect the new order.
3. IF the Organizer attempts to move a Player beyond the first or last position in the Queue, THEN THE App SHALL keep the Player in their current position and not modify the Queue order.
4. WHEN the Organizer removes a Player from the Queue, THE App SHALL remove the Player from the Session roster and re-number remaining positions starting from 0.
5. IF the Organizer removes a Player who is currently assigned to an active Match, THEN THE App SHALL remove the Player from the Session roster and from the active Match display.
6. WHEN a Match completes and Players return to the Queue, THE App SHALL place those Players at the end of the Queue in the order of their original court-assignment positions (lowest position first).

### Requirement 4: Court Assignment and Match Start

**User Story:** As an organizer, I want to assign players from the queue to available courts, so that games can begin without confusion about who plays next.

#### Acceptance Criteria

1. WHEN a Court is available and at least 4 Players are in the Queue, THE App SHALL indicate that a Match can be started on that Court.
2. WHEN the Organizer selects an available Court and starts a Match, THE App SHALL assign the next 4 Players from the front of the Queue to that Court and set the Court status to active.
3. WHEN a Match is started, THE App SHALL remove the assigned Players from the Queue, re-number remaining Queue positions starting from 0, and display the assigned Players as active on the assigned Court.
4. IF fewer than 4 Players are in the Queue and a Court is available, THEN THE App SHALL display the Court as available but not allow a Match to be started on that Court.
5. THE App SHALL display each active Court with the names of the 4 Players currently assigned to it.
6. IF the Organizer attempts to start a Match on a Court that already has an active Match, THEN THE App SHALL prevent the action and display an error message indicating the Court is occupied. THE App SHALL only display match-start error messages for this occupied-court condition.

### Requirement 5: Match Completion and Rotation

**User Story:** As an organizer, I want to mark matches as complete, so that players rotate back into the queue and the next group can play.

#### Acceptance Criteria

1. WHEN the Organizer marks a Match as complete, THE App SHALL move all Players from that Match to the end of the Queue in the order they were listed on the Court.
2. WHEN a Match is marked complete, THE App SHALL set the Court status to available.
3. WHEN a Match is completed and at least 4 Players are in the Queue, THE App SHALL indicate that a new Match can be started on the freed Court.
4. IF the Organizer attempts to mark a Match as complete that is not currently active, THEN THE App SHALL display an error message indicating no active Match exists on that Court, explicitly preserve all current state (match and court status remain unchanged), and take no further action.
5. IF a Player was removed from the Session while assigned to an active Match, THEN THE App SHALL not return that Player to the Queue when the Match is marked complete.

### Requirement 6: Live Player View

**User Story:** As a player, I want to view the current queue and court status from my phone, so that I know when my turn is coming without asking the organizer.

#### Acceptance Criteria

1. WHEN a Player opens the Session Live_View URL, THE App SHALL display the current Queue order showing each Player's position and name, active Matches on each Court with assigned Player names, and the next 4 Players in the Queue highlighted as up next.
2. THE App SHALL update the Live_View within 5 seconds of any Queue or Court state change.
3. THE App SHALL display the Live_View without requiring login or account creation.
4. THE App SHALL display each Player's queue position as a zero-based integer starting from 0 for the first Player in the Queue.
5. IF a Player opens a Live_View URL for a Session that does not exist, THEN THE App SHALL display an error message indicating the Session was not found.

### Requirement 7: Session State Persistence

**User Story:** As an organizer, I want the session state to persist if I accidentally close my browser, so that I do not lose the current queue and match data.

#### Acceptance Criteria

1. WHEN any change occurs to the Queue order, active Matches, or Player roster, THE App SHALL persist the updated Session state within 2 seconds of the change.
2. WHEN the Organizer reopens the Session URL within 24 hours of the last state change, THE App SHALL restore the full Session state including Queue order, active Matches, and Player roster as it was at the time of the last persisted change. IF more than 24 hours have elapsed since the last state change, THE App SHALL not restore state regardless of whether the browser remained open.
3. IF the stored Session state is corrupted, unreadable, or restoration fails for any technical reason, THEN THE App SHALL display an error message indicating the state could not be restored and offer to start a new Session. THE App SHALL only display restoration error messages for these specific conditions (corruption, unreadable, or restoration failure).
4. WHILE the Organizer's browser is closed, THE App SHALL continue to serve the persisted Session state to Players accessing the Live_View URL.

### Requirement 8: Session End

**User Story:** As an organizer, I want to end a session, so that the queue is cleared and the session is marked as complete.

#### Acceptance Criteria

1. WHEN the Organizer confirms the end-session action, THE App SHALL mark the Session as complete, clear the Queue, and stop accepting new Check_Ins.
2. WHEN the Organizer initiates ending a Session, THE App SHALL prompt for confirmation before completing the action.
3. WHEN a Session is ended, THE App SHALL display a summary to the Organizer showing the total number of Players who checked in during the Session and the total number of Matches completed during the Session.
4. WHEN a Player opens the Live_View of an ended Session, THE App SHALL display a message indicating the Session has ended along with the session summary.
5. IF active Matches are in progress when the Organizer ends a Session, THEN THE App SHALL mark those Matches as complete and include them in the total Matches count in the session summary.

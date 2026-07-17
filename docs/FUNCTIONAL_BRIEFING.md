# Bribery Game Functional Briefing

This briefing outlines every observable behaviour, rule, and player-facing capability of the Bribery party game.

## 1. Core Goals and Player Experience
- Bribery is a casual multiplayer party game where players use creative "bribes" to win points from one another based on personalised prompts.
- Sessions are hosted online and accessed through shareable four-character game codes or direct `/game/<GAME_ID>` links.
- The experience must be mobile-friendly, support quick join flows, and keep players informed about progress, timers, and connection health at all times.

## 2. Game Setup & Lobby Expectations
- A host can create a new lobby by supplying a display name; the system allocates an unused four-character alphanumeric (A-Z, 0-9) game code and marks the creator as host.
- Creation returns the host's persistent player identifier and a shareable link (`/game/<GAME_ID>`). The host must see the code, link, copy-to-clipboard control, and a shortcut to enter the lobby.
- Other players join by providing a name and the game code (case-insensitive). Joining responds with their persistent player identifier, host status, and the game's current phase so the UI can transition appropriately.
- The lobby lists every player with connection status, identifies the host, and shows live player counts. It must surface the current game configuration, including round timer settings, to everyone.
- Host-only controls in the lobby include:
  - Editing game settings before the first round. Current settings cover optional time limits for Prompt, Submission, Voting, and Appreciation.
  - Each phase timer is off by default and can be enabled independently. Disabled timers still show their default duration so the host can enable them quickly.
  - Enabled timer durations are configured in seconds, clamped to 1-600 seconds.
  - A start button that remains disabled until at least three connected players are active.
- The landing page also offers a "How To Play" overlay so new participants can read the rules without leaving the flow.
- Any player may leave and rejoin. Rejoining prefers a stored player identifier, falls back to case-insensitive username matching, and keeps prior scores and state. Duplicate stale sockets are cleaned up automatically.
- Hosts may remove non-host players from the lobby or mid-game. Kicked players receive a notice and are redirected to the home screen; remaining players are notified and the roster updates.
- Attempts to join finished or unknown games show dedicated banners guiding the user back home.

## 3. Round Lifecycle Overview
Each game plays rounds through prompt writing, bribe submission, voting, appreciation, and scoreboard.

State names follow this order:
1. `lobby`
2. `prompt`
3. `submission`
4. `voting`
5. `appreciation`
6. `scoreboard`
7. `finished`

Progression rules:
- Moving from lobby to the first round requires host action and the three-player minimum.
- Rounds increment sequentially and stop when the configured count is reached, after which the game enters `finished`.
- Lobby and scoreboard are host-controlled and do not have round timers.
- Prompt, Submission, Voting, and Appreciation may each have an independently enabled time limit.
- The server is authoritative for timer start time, end time, duration, and phase revision. Clients display countdowns from server timestamps and never advance phases locally.
- When a timer reaches zero, the server completes any unfinished active-player work for that phase and advances once. Early completion still advances immediately and ends the active timer.
- When a timer is disabled, the phase waits for all active players to complete, or for valid host/offline-player controls where available.

## 4. Prompt Phase
- Each active player writes the personalised prompt others will answer when bribing them.
- Prompt text is limited to 200 characters. Players can use a "Give me an idea" action to fill from the curated prompt library.
- Prompt drafts are autosaved to the server after typing pauses so disconnects, refreshes, and timer expiry do not depend on a last-second client submit.
- If the prompt timer expires, the server submits each unfinished player's saved draft when it is non-empty. If no usable draft exists, the server chooses a random prompt from the backend prompt library.
- Completion occurs as soon as all active players submit, or when the timer expires. Late-joining players marked "waiting" stay sidelined until the next round.

## 5. Target Assignment
- Every active player must bribe exactly two distinct targets and receive exactly two bribes per round.
- Pairings avoid self-targeting and attempt to rotate partners by tracking past matchups. If history exhaustion makes unique targets impossible, the history for that player resets to allow repeats.
- After pairings are generated, the system validates that every active player receives two incoming bribes, rebalancing assignments when necessary. Past target history updates only after a balanced pairing is finalised.
- Players who join mid-round are marked inactive until the next round, then automatically activated, given score records, and added to the pairing rotation.

## 6. Submission Phase
- The UI reveals round number, total rounds, and either the shared prompt (traditional mode) or clear cards for each target showing the target's name and personalised prompt.
- For every assigned target, players can submit exactly one bribe using:
  - Free-form text area (supports plain text or pasted links).
  - Drag-and-drop image upload, clipboard paste, or mobile file/camera picker accepting standard image formats and GIFs up to 8 MB. Oversized images are compressed/resized where practical while preserving aspect ratio; GIFs retain animation.
- Text and uploaded media drafts are autosaved to the server at reasonable intervals. Media drafts save after upload succeeds; text drafts save after typing pauses.
- Once a bribe is submitted, its controls disable and show a success state. If the submission timer expires, the server submits each missing assigned bribe from a valid saved text or media draft.
- Progress indicators broadcast the count of players who finished versus the total, calling out specific pending names when two or fewer remain. When everyone finishes, the timer stops.
- The system tracks per-round, per-target submissions. If no valid draft exists when the phase expires, the server submits the fallback text `<didn't submit a bribe in time, for shame>` so downstream phases always have a complete set of bribes.

## 7. Voting Phase
- Each player reviews only the bribes that target them. Submitter identities remain hidden during voting.
- Bribes display as formatted text or embedded media previews depending on type. Players select one option at a time; the confirmation button stays disabled until a choice is made.
- Vote selections are saved to the server immediately as drafts. If the voting timer expires, the server submits each unfinished player's saved vote when valid; otherwise it randomly chooses one available bribe for that voter.
- Without a timer, the phase waits for all active players with voting work to submit.
- Progress indicators mirror the submission phase, showing how many players have voted and spotlighting specific holdouts when applicable.
- Votes persist even if players disconnect afterward. Reconnecting voters re-enter the phase with their previous choice recorded.

## 8. Appreciation, Scoreboard & Scoring
- Ending the voting phase transitions to appreciation. For each prompt owner, the UI shows their prompt, the winning bribe, and the winner's identity. Randomly generated winners append "randomly generated" only at this stage.
- During appreciation, every active player can browse the winning bribes and award one bonus coin to any eligible winning bribe they like. A player cannot award a coin to their own winning bribe or to the winning bribe for their own prompt, but they can award a coin to a bribe that beat one of theirs.
- Appreciation results are personalised: the first entries are prompts the viewer submitted bribes for, clearly showing when their bribe won or which competing bribe beat theirs, and the final entry is the viewer's own prompt and chosen bribe.
- Inactive waiting players can browse but cannot award coins or block phase completion. Appreciation completion mirrors submission and voting: it waits for all active players, and the host can advance without offline blocking players when the active-player minimum is still satisfied.
- If the appreciation timer expires, the server marks unfinished active players as done while preserving any coins they already toggled.
- Ending appreciation transitions to the scoreboard and applies scoring:
  - Each chosen bribe earns a point chunk equal to the number of active players in the round, rounded up to the nearest 5.
  - Each bonus coin awarded by another player adds 1 point.
  - A player with multiple chosen bribes earns the base chunk once per chosen bribe.
- The scoreboard shows a round board with points earned this round and a breakdown of chosen-bribe points plus bonus-coin points. From round 2 onward, it also shows an overall board with cumulative scores after adding the round. Both boards highlight the top three with gold, silver, and bronze treatments.
- Scoreboard is not timed. Only the host sees controls to continue to the next round.

## 9. Game Completion & Post-Game Options
- After the final round, the game enters `finished` and announces podium placements for the top three scores with celebratory visuals.
- Final results remain visible until the host chooses to return to the lobby (preserving roster and settings) or restart (resetting scores, round counters, prompts, bribes, and votes). A shortcut to start an entirely new lobby is also presented.
- Rooms with zero connected players for 15 minutes are reclaimed automatically.

## 10. Player Status, Waiting, and Reconnection Handling
- Connection status indicators stay visible during gameplay. Losing connection shows a reconnect overlay and status badge. The client attempts automatic reconnection, performs limited manual retries when the page regains focus/visibility, and suggests a full refresh if all attempts fail.
- Auth state (player ID, username, host flag, game ID) persists in local storage so refreshes or temporary disconnects can re-authenticate automatically. Timer display is restored from the server's current phase timestamps after reconnect.
- Players reconnecting mid-phase receive the current phase UI (prompt draft, submission targets and drafts, voting options and draft vote, appreciation state, or scoreboard snapshot) populated with their prior inputs. Late joiners who were waiting continue to see a dedicated waiting screen until the next round starts.
- If a host disconnects, the game continues. Host privileges remain attached to their player record when they return.

## 11. Player List Panel & Moderation
- A collapsible player list is available throughout the game and pinned open on larger screens. It shows usernames, host badges, connection status, current scores, and per-phase submission status icons (submitted vs. pending) when relevant.
- Hosts see "Kick" actions next to non-hosts. Confirming a kick emits notifications to all players and updates the list immediately.

## 12. Content Sources & Default Assets
- Prompt suggestions originate from the curated prompt library bundled with the experience. The backend uses the same library when it must provide a timeout fallback prompt.
- Timeout fallback bribes use a fixed placeholder text so every assigned bribe slot is complete before voting begins.
- Branding assets (logos, favicons) load with graceful fallbacks so the UI always displays a title even if images fail.

## 13. Error, Messaging, and Feedback Conventions
- All server validation errors emit structured messages. Common cases include missing usernames, missing game codes, insufficient players to start, and non-host attempts to trigger host-only actions.
- Friendly banners communicate when a game code is invalid or when a game has already ended, offering a one-click return home.
- Phase transitions update a status bar with contextual instructions ("Submit your bribes!", "Vote for your favourite bribe!", etc.). Button states and labels reflect availability (for example, disabled "Start Game" until requirements are met, "Submitted OK" after actions complete).
- Progress trackers, timers, and overlay messages must respond instantly to server events so players always understand what is happening next.

## 14. Persistence & Cleanup Expectations
- All per-round data (pairings, prompts, bribes, votes, scores) must be isolated so new rounds start cleanly while retaining cumulative totals.
- Restarting or returning to the lobby clears temporary round data while preserving the player roster and game settings (for lobby) or resetting scores (for restarts).
- Rooms with zero connected players for 15 minutes are eligible for cleanup to avoid stale sessions.

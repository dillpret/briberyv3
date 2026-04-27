# Bribery Game Functional Briefing

This briefing outlines every observable behaviour, rule, and player-facing capability of the Bribery party game.

## 1. Core Goals and Player Experience
- Bribery is a casual multiplayer party game where players use creative "bribes" to win points from one another based on personalised prompts.
- Sessions are hosted online and accessed through shareable four-character game codes or direct links.
- The experience must be mobile-friendly, support quick join flows, and keep players informed about progress, timers, and connection health at all times.

## 2. Game Setup & Lobby Expectations
- A host can create a new lobby by supplying a display name; the system allocates an unused four-character alphanumeric (A–Z, 0–9) game code and marks the creator as host.
- Creation returns the host’s persistent player identifier and a shareable link (`/bribery/<GAME_ID>`). The host must see the code, link, copy-to-clipboard control, and a shortcut to enter the lobby.
- Other players join by providing a name and the game code (case-insensitive). Joining responds with their persistent player identifier, host status, and the game’s current phase so the UI can transition appropriately.
- The lobby lists every player with connection status, identifies the host, and shows live player counts. It must surface the current game configuration (round count, timer settings, custom prompt status) to everyone.
- Host-only controls in the lobby include:
  - Editing settings before the first round: rounds (1–100), submission/voting/results/prompt-selection timers (0–600 seconds, where 0 means “wait for everyone/host-controlled”), and toggling custom prompts.
  - A start button that remains disabled until at least three connected players are active.
- The landing page also offers a “How To Play” overlay so new participants can read the rules without leaving the flow.
- Any player may leave and rejoin. Rejoining prefers a stored player identifier, falls back to case-insensitive username matching, and keeps prior scores and state. Duplicate stale sockets are cleaned up automatically.
- Hosts may remove non-host players from the lobby or mid-game. Kicked players receive a notice and are redirected to the home screen; remaining players are notified and the roster updates.
- Attempts to join finished or unknown games show dedicated banners guiding the user back home.

## 3. Round Lifecycle Overview
Each game plays a configurable number of rounds. Depending on the custom prompt toggle, every round contains either three phases (submission → voting → results) or four phases (prompt selection → submission → voting → results).

State names follow this order:
1. `lobby`
2. `prompt_selection` (only when custom prompts are enabled)
3. `submission`
4. `voting`
5. `scoreboard`
6. `finished`

Progression rules:
- Moving from lobby to the first round requires host action and the three-player minimum.
- Rounds increment sequentially and stop when the configured count is reached, after which the game enters `finished`.
- If automated timers are configured for a phase, reaching zero immediately advances to the next phase. Early completion cancels any running timers.
- When there is no timer (value 0), the phase waits for everyone to complete (prompt selection, submission, or voting) or, for the scoreboard, the host explicitly advances.

## 4. Prompt Selection Phase (Custom Prompt Mode)
- Each active player chooses the prompt others will answer when bribing them. The interface offers both a dropdown of curated prompts from the prompt library and a free-text field (up to 200 characters).
- Players can switch between the dropdown and custom text; confirming clears the alternate input and the confirmation button disables after use.
- If the prompt-selection timer expires and a player has selected but not confirmed, the selection auto-confirms. Players who never choose receive a random default prompt so downstream phases always have content.
- Completion occurs as soon as all active players confirm, or when the timer expires. Late-joining players marked “waiting” stay sidelined until the next round.

## 5. Target Assignment
- Every active player must bribe exactly two distinct targets and receive exactly two bribes per round.
- Pairings avoid self-targeting and attempt to rotate partners by tracking past matchups. If history exhaustion makes unique targets impossible, the history for that player resets to allow repeats.
- After pairings are generated, the system validates that every active player receives two incoming bribes, rebalancing assignments when necessary. Past target history updates only after a balanced pairing is finalised.
- Players who join mid-round are marked inactive until the next round, then automatically activated, given score records, and added to the pairing rotation.

## 6. Submission Phase
- The UI reveals round number, total rounds, and either the shared prompt (traditional mode) or clear cards for each target showing the target’s name and personalised prompt.
- For every assigned target, players can submit **exactly one** bribe using:
  - Free-form text area (supports plain text or pasted links).
  - Drag-and-drop image upload, clipboard paste, or mobile file/camera picker accepting standard image formats and GIFs up to 5 MB. Oversized images are compressed/resized while preserving aspect ratio; GIFs retain animation.
- Once a bribe is submitted, its controls disable and show a success state. A submission timer (if set) auto-submits any non-empty drafts (text or processed images) when it expires.
- Progress indicators broadcast the count of players who finished versus the total, calling out specific pending names when two or fewer remain. When everyone finishes, the timer stops.
- The system tracks per-round, per-target submissions. Missing entries when the phase ends are filled with whimsical random bribes sourced from curated noun/activity lists. Random entries are flagged internally for scoring and later UI labelling.

## 7. Voting Phase
- Each player reviews only the bribes that target them. Submitter identities remain hidden during voting.
- Bribes display as formatted text or embedded media previews depending on type. Players select one option at a time; the confirmation button stays disabled until a choice is made.
- If a voting timer exists, it auto-submits any already-selected choice when time expires. Without a timer, the phase waits for all votes.
- Progress indicators mirror the submission phase, showing how many players have voted and spotlighting specific holdouts when applicable.
- Votes persist even if players disconnect afterward. Reconnecting voters re-enter the phase with their previous choice recorded.

## 8. Results & Scoring
- Ending the voting phase transitions to the scoreboard. For each prompt owner, the UI shows their prompt, the winning bribe, and the winner’s identity. Randomly generated winners append “(randomly generated)” only at this stage.
- Scoring rules per winning vote:
  - 1 point for player-authored bribes.
  - 0.5 points for auto-generated bribes.
- Round summaries display the incremental points earned and cumulative totals. Players appear sorted by total score, with host identification retained.
- When an automatic results timer is configured, it counts down before triggering the next round automatically. Otherwise, only the host sees controls to continue.

## 9. Game Completion & Post-Game Options
- After the final round, the game enters `finished` and announces podium placements for the top three scores with celebratory visuals.
- Final results remain visible until the host chooses to return to the lobby (preserving roster and settings) or restart (resetting scores, round counters, prompts, bribes, and votes). A shortcut to start an entirely new lobby is also presented.
- Completed games schedule cleanup approximately 30 seconds later; inactive lobbies with zero connected players are also reclaimed automatically.

## 10. Player Status, Waiting, and Reconnection Handling
- Connection status indicators stay visible during gameplay. Losing connection shows a reconnect overlay and status badge. The client attempts automatic reconnection, performs limited manual retries when the page regains focus/visibility, and suggests a full refresh if all attempts fail.
- Auth state (player ID, username, host flag, game ID) persists in local storage so refreshes or temporary disconnects can re-authenticate automatically. Timers also persist their end timestamps locally to survive refreshes.
- Players reconnecting mid-phase receive the current phase UI (prompt selection choices, submission targets, voting options, or scoreboard snapshot) populated with their prior inputs. Late joiners who were waiting continue to see a dedicated waiting screen until the next round starts.
- If a host disconnects, the game continues. Host privileges remain attached to their player record when they return.

## 11. Player List Panel & Moderation
- A collapsible player list is available throughout the game and pinned open on larger screens. It shows usernames, host badges, connection status, current scores, and per-phase submission status icons (submitted vs. pending) when relevant.
- Hosts see “Kick” actions next to non-hosts. Confirming a kick emits notifications to all players and updates the list immediately.

## 12. Content Sources & Default Assets
- Prompt suggestions originate from the curated prompt library bundled with the experience. When custom prompts are disabled, each round pulls a random entry from that list as the shared prompt.
- Random bribes draw from two separate curated pools (whimsical nouns and activities) to ensure playful filler content.
- Branding assets (logos, favicons) load with graceful fallbacks so the UI always displays a title even if images fail.

## 13. Error, Messaging, and Feedback Conventions
- All server validation errors emit structured messages. Common cases include missing usernames, missing game codes, insufficient players to start, and non-host attempts to trigger host-only actions.
- Friendly banners communicate when a game code is invalid or when a game has already ended, offering a one-click return home.
- Phase transitions update a status bar with contextual instructions (“Submit your bribes!”, “Vote for your favourite bribe!”, etc.). Button states and labels reflect availability (for example, disabled “Start Game” until requirements are met, “Submitted ✓” after actions complete).
- Progress trackers, timers, and overlay messages must respond instantly to server events so players always understand what is happening next.

## 14. Persistence & Cleanup Expectations
- All per-round data (pairings, prompts, bribes, votes, scores) must be isolated so new rounds start cleanly while retaining cumulative totals.
- Restarting or returning to the lobby clears temporary round data while preserving the player roster and game settings (for lobby) or resetting scores (for restarts).
- Finished games without active players are eligible for cleanup to avoid stale sessions.

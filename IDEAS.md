# Ideas

Ideas worth doing, not scheduled yet. Pick one, build it, then remove it from this list. Add new ones with a line
on why they'd be fun or useful.

## Gameplay

- **Category picker / question packs** in the lobby. Only worth it once the pool is big enough that a pack still
  fills a game.
- **Reactions:** quick emoji taps on reveal cards, shown briefly on every screen. Cheap fun while the cards flip.
- **Shareable recap image** at the end of a game (rendered client-side, no external services).
- **Lifetime stats and badges:** most dunce caps, best bullseye, longest streak against the swarm. `player_games`
  (one row per player per finished game: score, dunce caps, whether FerMEANie won) already feeds the intro's roll
  call; per-round stats are mostly queries over `games`.
- **Tie ordering.** The client orders tied players differently from the server's `byStanding` (score, then name).
  Make them match. Ties are also ignored in places: the final screen crowns `ranking[0]`, and positions are `i + 1`
  on the final screen, scoreboard, controller reveal and break screen, so equal scores get different places.

## FerMEANie

- **Head-to-head record per player.** "Ada. Our record: 3–5. To me." Uses the player id and the `games` table.
- **Lobby lines from the server,** e.g. greeting a returning player with their history (dunce count, last game).
  Needs a line picker outside a game. Lobby and home texts are hard-coded in the client today (`Lobby.vue`,
  `ScreenLobby.vue`, `HomeScreen.vue`), so the screen she sits on longest always says the same two things, outside
  the Fluent checks.
- **More moments:** streaks (beat the swarm N rounds in a row), a comeback from last place, FerMEANie taking the
  lead, the game ending early because the questions ran out, play again. She's also silent during the question
  itself and at time-up: "10 s left", the fastest lock-in, the last one still typing, nobody answering. The server
  already knows ties for the lead (today a tie means no leader at all, so no lead line), the size of the score gap
  and the question's category, and never uses them.
- **Repeat avoidance across games for every pool.** Only dunce lines avoid what a player heard in earlier games
  (`player_lines`). The rest only avoid repeats within one game, so a group playing back to back hears the same
  `intro` and `quip` lines, and the 15-line pools (`break_time`, `host_wait`, `lead_change`, `twins`,
  `everyone_locked`) wear out first. Key the history on the players' `seenKey`.
- **Type only the name in the join greeting.** NameForm rebuilds the whole greeting on every keystroke, so
  `FermeanieSays` carries about 20 lines of special cases for it alone (keep the typed prefix, don't restart the
  "typing…" beat while a name is typed fast). Typing the fixed part once and only the name live would drop them and
  keep the bubble one simple timeline.
- **A voice on the big screen** with the Web Speech API (robotic, opt-in). Fluent attributes could hold a spoken
  variant of a line (`.tts`) where the written one relies on formatting.

## Game design questions

Not bugs: choices to make, with the trade-off.

- **Steal size grows with the group.** A steal takes the sum of everyone's round points, about 100·N(N+1)/2, while
  the best human can earn about 100·N per round. With 8 players one steal is about 3,600 against a 900 ceiling, so
  two steals decide a game, and FerMEANie is much harder in big groups than in small ones. Options: steal only the
  round winner's points, or cap at a multiple of the best round score.
- **0 or a negative answer beats a blank.** A non-positive answer still gets a rank and at least 100 points, and
  adds to `n`, which gives everyone else +100. A blank gets 0. Give it 0 and leave it out of `n`?
- **Points ignore how far off you were.** Points follow rank only; magnitude only matters through the close and
  bullseye bonuses. Log-error-scaled points or a 2× final round would keep games closer.
- **Question order.** `ORDER BY seen, RANDOM()` can serve three space questions in a row; `difficulty` is never
  used; once a group has seen everything, `seen_at` doesn't break the tie, so yesterday's question can come back
  first; templates are only kept apart within a game; questions past `recheckAfter` are still served until someone
  runs `pnpm q check`.
- **Dunce caps in small groups.** The cap needs the median/MAD outlier test to fire, which it rarely does with 3–4
  answers, so a 10⁴× miss can go uncapped.

## Player experience

- **Lock in while offline** queues the lock but the button doesn't change until the server answers, so it looks
  like nothing happened. Show a pending state and an offline banner near the editor.
- **"Your last line counts."** Unlocked drafts are scored, but nobody is told, and the Lock button is disabled until
  the answer is valid. A hint at the urgent threshold and a short "Time's up" moment would calm the last seconds.
- **Calculator on a phone:** the helper keys lack digits, `.`, `+`, `-` and `_` (three taps away on iOS), and the
  textarea has no `inputmode`. The decimal-comma Fix button is 32 px, under the 44 px touch target. The caret-line
  `aria-live` announces every caret move. Line values and number-line pins are only in `title` (no hover on a phone).
- **The QR code is inverted** (light on transparent over dark), which some camera apps can't scan. It's the main
  way to join: dark modules on a white quiet zone.
- **Player accounts** (`kazie#001`), so one player can play from several devices: today identity is a per-browser
  key, so a new device or an in-app browser is a new person, with no history. Sketch and open decisions are in the
  owner's local roadmap (PR 6): optional accounts, how a device links (PIN, or a link/QR from a signed-in device),
  recovery, brute-force limits, and merging device history into the account.
- **Rename** is in the protocol but no UI sends it, so a typo or an auto-suffixed "Sam 2" sticks.
- **Getting back in:** Home doesn't remember the last room; a network error shows "Room X doesn't exist"; in-app
  browsers (WhatsApp, Instagram) have their own storage and create a second player. One tap on the header logo
  leaves the game with no confirmation.
- **Players who left** stay in the strip and in "Locked in X / Y", while the server already ends the round without
  them, so "3 / 4" turns into the reveal unexpectedly. Hosts can't kick anyone or hand over hosting.
- **Controller reveal spoils your rank:** "Your card is coming up after N more", while the full reveal hides names
  on card backs for exactly that reason.
- **"Next question in Ns"** is shown even when a break follows, or the host paces the game.
- **Small screens and focus:** number-line labels are sized in percent from name length and overlap at 360 px; focus
  falls back to `<body>` and nothing is announced on phase changes; `document.title` never changes, so a background
  tab can't show the timer or "Reveal!"; safe areas are only applied to the helper keys.
- **Feedback:** the only vibration is the steal. 10 s left, your card flipping and being locked in are obvious
  moments. Host commands queued while offline replay later (a double-tapped Next can skip a later break).

## Server and operations

- **Deploys kill every game.** Rooms live in memory and SIGTERM closes sockets at once; clients then see "room
  doesn't exist" and `games` rows stay unfinished. Drain first (no new rooms, a notice, wait for lobby or final
  with a timeout); later, snapshot rooms at each phase change.
- **WebSocket load:** no per-connection rate limit, and every broadcast (each lock, rename, skip vote, typing
  toggle) re-sends the full reveal with every sheet, about 180 KB × 30 recipients. Send the reveal once per phase
  or cache its serialized part.
- **Version handshake:** after a deploy, old tabs keep talking to the new server. Send a build id in the snapshot
  and reload when it changes.
- **Abuse basics:** 24⁴ room codes with no lookup rate limit; with `FERMI_TRUST_PROXY` the leftmost
  `X-Forwarded-For` (client-controlled) is used, which dodges the rate limits; the admin token is compared with
  `!==` and failures aren't limited; names allow zero-width and bidi lookalikes (and `slice(0, 21)` can split a
  surrogate pair); player keys travel in the WebSocket URL, so they land in proxy logs.
- **Leaks:** `keyToId` is never pruned; TV sockets have no heartbeat, so a half-open TV keeps a room alive forever.
- **Decide once whether a dispute counts.** Only players who were dealt a question count towards taking it out of
  rotation. Today that's worked out at count time: every new dispute re-checks all open ones against `player_seen`,
  decoding the `key:` prefix in SQL. Storing a `counts` flag (or a separate key-hash column) when the dispute is
  saved makes the count a plain tally. Needs a column in `disputes`.
- **Per-question play stats** (a `round_results` table: crowd error, signed log bias, best and median error, dunce
  and steal, lock times) would feed the question pipeline. A systematic bias across many players hints at a wrong
  answer, a cluster around 1000× off at a unit mix-up, and steal and bullseye rates can be checked against
  `difficulty`. There's almost no logging today either.

## Content and languages

- **A second language** (e.g. Swedish). This is where Fluent pays off: move the client's `strings.ts` to
  [fluent-vue](https://github.com/fluent-vue/fluent-vue) (`$t`, and `<i18n>` for components inside sentences), and
  add a `content/fermeanie/sv/` folder of lines. FerMEANie's lines are formatted on the server, so fluent-vue only
  covers the interface; the server would pick the room's locale.

## Decided (kept for the reasoning)

- **FerMEANie's version.** It used to gain a digit of π per win, which grows without end. Alternatives considered:
  semver with wins as the patch number (`v3.14.23`), orders of magnitude (too rare to hit), other constants (e, the
  golden ratio: π without the joke). Chosen: a capped `v3.141592…`, a named pie release every 5 wins (the π/pie pun
  everyone gets), and a changelog-style release note on every win.
- **Fluent features.** Terms and message references were left out: they only add naming consistency, and plain
  lines are easier to write and check. Selectors on numbers (plurals and exact cases like `[2] twice`) are allowed.
- **No solo or two-player games.** Fermi is a game for friends, and FerMEANie, the swarm, needs at least 3 answers to
  play a round. A game needs `MIN_PLAYERS` (3) connected players to start; solo practice against a stand-in swarm was
  dropped.

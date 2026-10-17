# Fermi

A multiplayer browser party game of napkin maths. Everyone gets the same Fermi question
("How many rivets hold the Eiffel Tower together?"), works it out in a calculator-style
**answer block**, and the closest estimates score. Then the working is revealed, furthest answer
first.

Lurking in every game is **FerMEANie**, a smug GLaDOS-style AI. It takes the _wisdom of the
crowd_, absorbing everyone's answers into **the swarm** (their geometric mean). If the swarm beats every human, it steals the round.
If someone types `1e99` to sabotage it, FerMEANie "changes the rules" and uses the median instead,
and puts a paper dunce cap on the culprit. The best human always wins the game, but FerMEANie keeps
score, and its version number gains one more digit of π each time it beats you (`v3.14` → `v3.141` → …).

It works on PCs and phones, and there is no presenter screen: everyone plays on their own device,
which also makes it work over a video call.

## Running it

```bash
pnpm install
cp .env.example .env        # then set FERMI_ADMIN_TOKEN to something random
pnpm dev                    # server on :3000, client on :5173 (proxying /api and /ws)
pnpm dev:lan                # same, reachable from phones on your network
```

Open http://localhost:5173, click **Host a game**, and share the link or QR code. You need questions
in the database first; see [Questions](#questions).

Requires Node ≥ 24. The server runs TypeScript directly through Node's type stripping, so there is no
build step. pnpm 12 is pinned in `package.json`.

### Docker

```bash
docker build -t fermi .
docker run -d -p 3000:3000 -v fermi-data:/data -e FERMI_ADMIN_TOKEN=… fermi
```

One container serves the client, the websocket and the API. The SQLite database lives in `/data`.

Behind a reverse proxy, set `FERMI_TRUST_PROXY=1` so rate limits see the real client address.

### Hosting notes

- **Fully self-hosted.** The game loads nothing from other servers: no CDNs, web fonts, analytics or icon
  services. It works with access to the game server alone, even on a closed LAN. The server's
  `Content-Security-Policy` makes browsers refuse anything else, and the e2e test fails if any request
  leaves the game's origin. (Histoire, the component-story dev tool, does load icons online, but it isn't
  part of the game.)

- **Players are identified by a private key** kept in each browser's localStorage. It is only ever
  sent to the server and stored there as a hash. Other players see a random per-room id, which can't be
  used to act as someone else.
- **Answers can't be looked up mid-round.** `/q/:id` only shows a question once it has been played,
  and not while a room is playing it.
- **Disputes:** the first dispute only flags a question. It leaves rotation once two different players
  have disputed it.
- **Rate limits** (per client): 10 new rooms/minute and 20 disputes/hour, with at most 2000 open rooms.

## Big screen mode

For a group in one room: open the site on a TV or laptop and choose **Host on a big screen**. That screen
shows the room code and QR big and then only _shows_ the game: the question, the reveal, the scores.
Everyone joins and answers on their phones; the first phone to join is the host and gets the Start
button. Groups where everyone has a PC can skip it and use **Host a game** instead.

While a big screen is connected, each phone can switch between **Controller** (the default: your own
card, your result and score, and "look at the big screen") and **Full view** (everything, as without a
TV). Any number of screens can watch: open `/screen/<CODE>`. Screens never play and never see anyone's
sheet.

## How a round works

1. **Question (30/60/90 s, chosen by the host).** Players see who has locked in, never what they answered.
   The round ends early once everyone has locked in.
2. **Reveal.**
   1. All answers drop onto a log-scale number line, then the true answer lands with its explanation
      and sources.
   2. Cards flip from furthest to closest, showing each player's full working.
   3. FerMEANie's swarm estimate lands.
   4. The scoreboard shows.
3. **Break** (optional, set in the lobby: off / 15 / 30 / 60 s, default 30). Between rounds there is a
   countdown to talk about the answers; when more than half of the connected players tap **Skip
   break**, the next question starts right away. There is no break after the last round.
4. **Scoring.** Error is measured in orders of magnitude (`|log10(guess / answer)|`), so 2× too high
   counts the same as 2× too low. Points are `100 × (N − rank + 1)`, plus +100 for being within 10%
   or +50 for being within 2×. If FerMEANie's estimate beats every human (ties go to the humans),
   it takes all of that round's points.

The tunable constants are in `packages/shared/src/scoring.ts` and `crowd.ts`.

## The answer block

The calculator is shared by client and server: the server re-evaluates every sheet itself.

```
# humans stacked to the moon
people = 8.1 billion
height = 1.7            # metres
moon = 384_400_000
people * height / moon
```

- One step per line, with the result shown on the right. The last line is your answer.
- Variables and `ans` (the previous line's result). Comments are shown at the reveal.
- `* × x ·` all multiply, `/ ÷` divide, `^ **` raise to a power, and `%` is a percentage. Implicit
  multiplication works too: `2(3+4)`, `3 days`, `seconds / 365days` (it binds tighter than `/`).
  A faint "read as" line shows how each line was understood.
- Numbers can be written `5k 2.5M 8bn 1e9 3 million`. Use `.` for decimals and `_` to group digits.
  Commas and spaces inside numbers are rejected with a one-click fix, because `1,000` means
  different things in different countries.
- Functions: `sqrt cbrt log10 log ln exp abs round floor ceil min max`. Constants: `pi π`.

## Questions

Questions live in the database and can be added **while the server runs**. A new question is
playable from the next round. Every question must carry dated sources: the publisher, a verbatim
quote containing the number, the access date and a Wayback Machine snapshot. Derived answers store
their formula in calculator syntax. [`content/QUESTION_RULES.md`](content/QUESTION_RULES.md) is the
full contract.

### Generating with Claude Code

```
/fermi-questions 6                         # try to add ~6 new questions (max 15 per run)
/fermi-questions 5 space food              # with a topic focus
/fermi-questions --template visitors-per-year 6   # many questions from one source family
/fermi-questions --recheck                 # re-verify disputed / changed / due questions
/loop 1h /fermi-questions 5                # slow, steady growth
```

The pipeline is built to be cheap and crash-safe:

1. `fermi-generator` (Haiku, pinned in `.claude/agents/`) writes 3 drafts per agent, saving each file
   as soon as it's done.
2. `pnpm q prepare` does the mechanical work with no LLM: it archives sources to the Wayback Machine,
   checks each quote against the live page or snapshot, and dry-runs ingest.
3. `fermi-verifier` (Sonnet) makes the judgement calls: does the number mean exactly what the question
   asks, is it fair, is it fun. Then it ingests.

Templates ([`content/question-templates.md`](content/question-templates.md)) turn one source table into
many questions; a game never asks two from the same template. Run the skill from a **fresh Claude Code
session**: inside a long coding session every orchestration step is expensive. It only ever reports
counts, so the person running it can still play.

### The `pnpm q` CLI

`pnpm q` is a thin client for the admin API, authenticated with `FERMI_ADMIN_TOKEN`. Use
`--server URL` to target a deployment.

| Command                                                          |                                                                                                                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm q add file.json… [--batch id] [--replaces id] [--dry-run]` | Insert, with all checks                                                                                                                                                |
| `pnpm q prepare <dir>`                                           | Archive sources, check quotes, dry-run ingest for a directory of drafts                                                                                                |
| `pnpm q list [--texts]`                                          | IDs, categories and statuses (no answers)                                                                                                                              |
| `pnpm q stats` / `pnpm q disputes`                               | Pool overview / open disputes                                                                                                                                          |
| `pnpm q check [--links]`                                         | Re-validate the pool and live sources (runs as a server-side job; the CLI polls it)                                                                                    |
| `pnpm q status <id> active\|retired\|disputed`                   | Change a question's status                                                                                                                                             |
| `pnpm q archive <url>`                                           | Find or create a Wayback snapshot                                                                                                                                      |
| `pnpm q quote <url> "<quote>" [n]`                               | Check a quote is on the page and contains `n`                                                                                                                          |
| `pnpm q export [file]` / `pnpm q import <file>`                  | Backup, restore and **merge**: import keeps statuses/flags, skips ids the target already has, de-duplicates the rest, merges rejections, and is safe to run repeatedly |

Every insert goes through `apps/server/src/questions/ingest.ts`:

- **Schema and dates:** zod validation; the snapshot must be within 7 days of the access date.
- **Quotes and formulas:**
  - the quote must contain the number;
  - a derived formula must evaluate to the answer;
  - each derived input must be set in the formula and appear in its cited quote.
- **Duplicates:** text similarity, the same source passage, or the same answer with related wording.
  Grey-zone matches return `409 needs_review` and can be cleared with
  `distinctFrom` + `distinctReason`. Rejected candidates are remembered.

Players can **dispute** an answer from the recap or `/q/:id` page. A disputed question is taken
out of rotation until `/fermi-questions --recheck` resolves it.

## Development

```bash
pnpm check          # what CI checks: format, lint, types, unit tests
pnpm test:e2e       # Playwright: three browsers (one emulating a phone) play a whole game
pnpm format         # Prettier (pnpm format:check to only check)
pnpm lint           # ESLint for TS + Vue (pnpm lint:fix to autofix)
pnpm story:dev      # Histoire stories for every component; "Screens / Devices" shows each screen at 360, 390 and 1280 px
```

Node version: see `.node-version`. Editor settings: `.editorconfig`.

### CI and automation (`.github/`)

- **CI** (`workflows/ci.yml`) runs on every PR and push to `master`:
  - format, lint, type check and unit tests;
  - Playwright e2e (report uploaded on failure);
  - client, stories and Docker image builds (not pushed).
  - A final `ci-ok` job sums it up. That is the one check to require.
- **Dependabot** (`dependabot.yml`) opens weekly, grouped PRs for npm packages, GitHub Actions and the
  Docker base image. Patch and minor updates merge automatically once `ci-ok` passes
  (`workflows/dependabot-auto-merge.yml`); majors wait for review.
- **Stories** (`workflows/stories.yml`) publishes the Histoire stories to GitHub Pages on pushes to
  `master`. They use only fake fixtures, never real questions.

### Code layout

| Path              |                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Calculator (tokenizer → Pratt parser → evaluator → formatting), scoring, crowd maths, protocol and question schemas                     |
| `apps/server`     | Hono HTTP + `ws`, SQLite (`node:sqlite`) with migrations, the room state machine, question ingest                                       |
| `apps/client`     | Vue 3 + Vite. Views are pure (props in, events out); `useSocket` owns the connection. Stories and fixtures live next to the components. |
| `content/`        | Question rules, FerMEANie's line pool and persona guide ([`FERMEANIE.md`](content/FERMEANIE.md))                                        |

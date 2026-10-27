# Fermi

A multiplayer browser party game of napkin maths. Everyone gets the same Fermi question ("How many rivets hold the
Eiffel Tower together?"), works it out in a calculator-style **answer block**, and the closest estimates score. Then
everyone's working is revealed, furthest answer first.

Lurking in every game is **FerMEANie**, a smug GLaDOS-style AI. It absorbs everyone's answers into **the swarm** (their
geometric mean), and if the swarm beats every human, it steals the round. It hands out paper dunce caps, stirs up the
competition between questions, and keeps a career record of its wins against you.

Play on phones and PCs, each on their own device (it works over a video call), or put the game on a TV and use phones
as controllers.

## Quick start

```bash
pnpm install
cp .env.example .env        # then set FERMI_ADMIN_TOKEN to something random
pnpm dev                    # server on :3000, client on :5173 (proxying /api and /ws)
pnpm dev:lan                # the same, reachable from phones on your network
```

Open http://localhost:5173, click **Host a game**, and share the link or QR code. The game needs questions in the
database first; see [Questions](#questions).

Requires Node ≥ 24 (see `.node-version`). The server runs TypeScript directly through Node's type stripping, so there is
no build step. pnpm 12 is pinned in `package.json`.

With Docker:

```bash
docker build -t fermi .
docker run -d -p 3000:3000 -v fermi-data:/data -e FERMI_ADMIN_TOKEN=… fermi
```

One container serves the client, the websocket and the API; the SQLite database lives in `/data`. See
[Self-hosting](#self-hosting) for the settings.

**Sound.** Sound is on by default, from the first tap (browsers won't play anything before one); the big screen asks
for a click until it gets one. The speaker in the header turns it off for that device. Sound effects are synthesised
in the browser (no audio files): a lab-style chime for each question, a ticking last five seconds and a time's-up
alarm, the truth landing, cards flipping, the steal, the winner, and each reaction its own little noise. Where sound plays depends on the mode:

- **Online** (no big screen): every device plays everything.
- **Party** (a big screen is connected): the big screen plays FerMEANie's voice and the shared sounds, and phones play
  only their player's own moments (your lock-in, your card, your turn in the roll call), so the room doesn't echo.

Phones also vibrate for their own moments and at ten seconds left, unless reduced motion is on.

**FerMEANie's voice.** With `FERMI_VOICE=1` she says her lines and reads each question aloud, wherever the shared
sounds play (see above). It's free and local: Kokoro text-to-speech in a Python worker the server
starts (the Docker image includes it; for `pnpm dev`, install uv and ffmpeg: uv sets up the worker's locked Python
packages from `apps/server/voice/`). See [content/VOICE.md](content/VOICE.md)
for the chosen voice, how clips are rendered ahead of time, `pnpm q voice` and `pnpm voice:render`.

## Playing

### Hosting

Fermi is a game for friends: it needs **at least 3 players**, because FerMEANie, the swarm of all your answers, only
plays a round with 3 or more answers. There is no solo mode.

- **Host a game:** everyone plays on their own device. The first player to join is the host: they pick the settings
  and press Start.
- **Host on a big screen:** for a group in one room. Open the site on a TV or laptop and choose **Host on a big
  screen**. It shows the room code and QR code big, then only _shows_ the game: the question, the reveal, the
  scores. Everyone joins and answers on their phones, and the first phone to join hosts.

While a big screen is connected, each phone can switch between **Controller** (the default: your own card, your
result and score, and "look at the big screen") and **Full view** (everything, as without a TV). Any number of
screens can watch at `/screen/<CODE>`. Screens never play and never see anyone's sheet.

If the host disconnects, the earliest-joined connected player takes over after 15 seconds.

### Settings

| Setting              | Options                               | Default |
| -------------------- | ------------------------------------- | ------- |
| Rounds               | 5, 10, 15                             | 10      |
| Seconds per question | 30, 60, 90                            | 60      |
| Pacing               | Timed breaks, Host taps Next          | Timed   |
| Break between rounds | Off, 15, 30, 60 s (timed pacing only) | 30 s    |
| Intro                | Full, Short, Off                      | Full    |

**Pacing.** With timed breaks, the game runs by itself; when more than half of the connected players tap **Skip
break**, the next question starts early. With **Host taps Next**, everyone talks the round over until the host taps
**Next question**, which suits a group that likes to argue about the answers. Either way the answer timer and the
reveal run on their own, and the host can't cut answering short.

**Intro.** Before the first question FerMEANie introduces herself, then each player in the order they joined, with a
backhanded compliment (players she has records on hear about their past games and dunce caps). **Full** goes on to
explain the rules on five slides and play an unscored example question from a small static pool
([`content/intro/examples.json`](content/intro/examples.json)): it's a real round with a short reveal, but nothing is
scored, saved or marked as seen. **Short** is the hello and the roll call only. The host can skip the intro at any
point, its example included, and anyone else can vote: a majority skips it. **Play again** switches Full to Short,
since the group has just heard the rules.

### A round

1. **Question.** Players see who has locked in, never what they answered. The round ends early once every connected
   player has locked in.
2. **Reveal.**
   1. **The call.** Everyone's answers appear as anonymous dots on a log-scale number line, and each phone asks: is
      the truth higher or lower than your answer? One tap, no points; it closes before the truth lands, and the right
      calls are counted (and feed the Hindsight award).
   2. The true answer lands with its explanation and sources.
   3. Cards flip from furthest to closest, showing each player's full working.
   4. FerMEANie's swarm estimate lands, and it has something to say about it.
   5. The scoreboard shows.
3. **Break** (see Pacing). There is no break after the last round.

During the reveal and the break, players can send **reactions** (bullseye, on fire, mind blown, to the moon, I'm dead,
big brain) from their phones; they float up on every screen, with the sender's avatar. They're drawn by the game, so
they look the same on every device, and each one is animated.

**Scoring.** Error is measured in orders of magnitude (`|log10(guess / answer)|`), so 2× too high counts the same as
2× too low. Points are `100 × (N − rank + 1)`, plus +100 for being within 10% or +50 for being within 2×. If
FerMEANie's estimate beats every human (ties go to the humans), it takes all of that round's points. The **final
question counts double**: rank points and bonuses, and a steal too; FerMEANie announces it. The best human wins the game; the tunable constants are in `packages/shared/src/scoring.ts` and `crowd.ts`.

**Awards.** Before the winner is crowned, FerMEANie reads out up to three awards, each to a different player and only
with a clear winner: Swarm Slayer (beat the swarm most often), Bullseye (most answers within 10%), Steady Hand (lowest
average error), The Abacus (longest working), Gut Feeling (fastest to lock in), Contrarian (most often on the other
side of the truth from everyone else), Bold Estimator (the furthest single miss), Last Minute, Swarm Twin, Comeback,
Optimist, Pessimist, Late Bloomer, One-Liner, Round Numbers, Near Miss, Swarm Donor and Hindsight (the most right
calls). Awards given in a room's
previous game go to the back of the queue, so a group playing again hears different ones. The rules are in
`packages/shared/src/awards.ts`; the recap lists a game's awards.

### The answer block

The calculator is shared by client and server, and the server re-evaluates every sheet itself.

```
# humans stacked to the moon
people = 8.1 billion
height = 1.7            # metres
moon = 384_400_000
people * height / moon
```

- One step per line, with the result shown on the right. The last line is your answer.
- Variables, and `ans` (the previous line's result). Comments are shown at the reveal.
- `* × x ·` all multiply, `/ ÷` divide, `^ **` raise to a power, and `%` is a percentage. Implicit multiplication
  works too: `2(3+4)`, `3 days`, `seconds / 365days` (it binds tighter than `/`). A faint "read as" line shows how
  each line was understood.
- Numbers can be written `5k 2.5M 8bn 1e9 3 million`. Use `.` for decimals and `_` to group digits. Commas and spaces
  inside numbers are rejected with a one-click fix, because `1,000` means different things in different countries.
- Functions: `sqrt cbrt log10 log ln exp abs round floor ceil min max`. Constants: `pi π`.

## FerMEANie

- **The swarm.** FerMEANie plays the geometric mean of everyone's answers. If someone types `1e99` to sabotage it, it
  "changes the rules" to the median, smugly, and puts a paper dunce cap on the culprit.
- **Commentary.** It greets the players, needles the leader and the last between questions (Portal 2 co-op style),
  notices lead changes, identical answers and suspiciously fast lock-ins, eavesdrops on the break, and gloats or sulks
  at the end.
- **Its version** gains a digit of π with every game it wins (`v3.14` → `v3.141` → … `v3.141592…`), and each win comes
  with release notes about the humans it beat. Every fifth win is a major release named after a pie (Apple Pie,
  Banoffee Pie, Cherry Pie…); after three losses in a row, it is served humble pie. The record is shared by every room
  on the server.

Its lines are [Fluent](https://projectfluent.org/) files in [`content/fermeanie/`](content/fermeanie/), one file per
situation, and may use a little formatting (`**bold**`, `*italic*`, `~~struck~~`, `||redacted||`) for comic effect.
The server checks them all at startup and refuses to start on a mistake, naming the file and line.
[`content/FERMEANIE.md`](content/FERMEANIE.md) is the persona and tone guide for writing more.

## Questions

Questions live in the database and can be added **while the server runs**; a new question is playable from the next
round. Every question carries dated sources: the publisher, a verbatim quote containing the number, the access date
and a Wayback Machine snapshot. Derived answers store their formula in calculator syntax.
[`content/QUESTION_RULES.md`](content/QUESTION_RULES.md) is the full contract.

### Generating with Claude Code

```
/fermi-questions 6                                # try to add about 6 new questions (max 25 per run)
/fermi-questions 5 space food                     # with a topic focus
/fermi-questions --template visitors-per-year 6   # many questions from one source family
/fermi-questions --recheck                        # re-verify disputed questions
```

For steady growth, let `pnpm grow` run unattended. It runs the same pipeline as the skill, but as a script
(`scripts/pipeline.ts`), so no Sonnet session is paid just to coordinate: it starts the generator and verifier agents
directly as headless sessions (`claude -p --agent …`), runs `pnpm q prepare` in between, and counts what was added from
the pool itself. It differs from the skill in a few ways that make it cheaper per question:

- **Planned ideas.** Each round starts with one tool-less Sonnet call (`scripts/plan.ts`) that sees the topic's existing
  question texts (retired ones too) and lists about two ideas per question still needed, each a different fact, with a
  likely source and sometimes a template slot. Each generator then drafts its own three ideas, so parallel generators
  don't collide on the same famous facts, and none has to invent or check for duplicates itself. If the planner has
  nothing usable, generators get the plain topic brief.
- **Rules in the system prompt.** The question rules go into every agent's system prompt (`--append-system-prompt`), so
  the same text is cached across sessions instead of each session reading the file.
- **Full verifier sessions.** Passed drafts wait until there are five (or drafting is done) before a verifier starts.
- **The screen.** Before verifying, it runs `pnpm review`'s Haiku screen on the drafts (category, question and unit
  only); the verifier gets the flags and must fix those drafts' wording or reject them ("N flagged by screen (M added)"
  in the report).

Parallel workers each take a different topic. A category whose last two runs within a day added at most one question
each gets a day's rest (`.fermi-work/topic-yield.json`). Each run prints one line with counts, the funnel
(`ideas → drafts → passed`), categories and its API-equivalent cost (from the sessions' `total_cost_usd`), and the end
of the run prints the total:

```
pnpm grow                          # 3 workers × 4 runs, each taking the emptiest free category
pnpm grow --workers 2 history art  # work through these topics, 2 at a time
```

At a usage limit, a worker sleeps until the reset time the limit message names, then carries on. A limit that lifts more
than 6 hours away (a weekly one, which names a date) stops the worker instead, so you can switch accounts and restart. Any other failed run is
retried after 20 minutes, and a worker gives up after 9 failures in a row. Only report and limit lines are printed.
Runs bill the Claude account whose config dir is in `FERMI_CLAUDE_CONFIG_DIR` (in `.env`, e.g. `~/.claude-personal`);
`pnpm grow` won't start without it, so it can never fall back to whichever account the shell defaults to.
The server must be running, and `.claude/settings.local.json` must allow the pipeline's tools (`pnpm q`, the two
agents, WebSearch, WebFetch, writes in `.fermi-work/` and, for the skill, `date`), since headless runs can't ask. Runs can safely
overlap: each works in its own batch folder, and a run only takes over another batch's drafts once that batch's run is
gone (under `pnpm grow`, its heartbeat stops; for a hand-started run, nothing in it has changed for 45 minutes). If you script runs by hand, `flock` keeps them one at a time.

The pipeline is built to be cheap and crash-safe:

1. The skill itself should run on **Sonnet**. Its frontmatter pin only covers the turn that invokes it, so pass
   `--model sonnet` (or run `/model sonnet` first) to keep the later turns cheap too. It only coordinates: it never searches, fetches
   or reads drafts.
2. `fermi-generator` (**Haiku**, pinned in `.claude/agents/`) writes 5 drafts per agent, saving each file as soon as
   it's done, with at most 2 searches and 3 page fetches per draft. Under `pnpm grow` it drafts the ideas it's assigned;
   from the skill it favours the categories with the fewest questions and picks its own. It never sees existing
   question texts (only ids and categories) and has no shell.
3. `pnpm q prepare` does the mechanical work with no LLM: it archives sources to the Wayback Machine, checks each quote
   against the live page or snapshot, saves the page text around it, and dry-runs ingest (which catches duplicates).
   Save Page Now refuses captures when too many run at once, so all runs share a few capture slots
   (`.fermi-work/.archive-slots`), a refused capture is retried after a pause, and a draft that still couldn't be
   archived is tried again on the next two `prepare` calls. Such a draft stays pending, so a later run that takes over
   its batch retries it too, and `pnpm grow` pauses two minutes at the end of each round for one more `prepare`. With free archive.org keys in `FERMI_ARCHIVE_KEYS`,
   captures use the logged-in API, which queues them instead of refusing them, so far fewer fail.
4. `fermi-verifier` (**Sonnet**) makes the judgement calls from that page text: does the number mean exactly what the
   question asks, is it fair, is it fun. Then it ingests with `pnpm q approve`, which stamps and saves the draft, so
   the verifier never re-types a whole file (output tokens are its biggest cost), or turns it down with
   `pnpm q reject --draft`, which also marks the draft rejected in its batch (`rejected/<id>.json`). Decided drafts
   are never checked or verified again, and `prepare` fails a draft whose wording a verifier already rejected.

**Harvesting a table.** `pnpm harvest <url> <category> [--count 15]` makes many questions from one page of tables (a
Wikipedia list whose rows are cited, or an official statistics table) for the price of one fetch, one archive and one
Sonnet call. Each table row's text becomes the verbatim quote; Sonnet picks the rows that make good questions and words
them, and the drafts then go through the same prepare, screen and verifier steps as `pnpm grow`'s, with the same
counts-only report line. The page must be plain HTML, since the quote check doesn't run JavaScript.

Templates ([`content/question-templates.md`](content/question-templates.md)) turn one source table into many
questions; a game never asks two from the same template. The skill only ever reports counts, so the person running it
can still play. Run it from a **fresh session**: inside a long coding session, every coordination step re-reads the
whole conversation.

### The `pnpm q` CLI

`pnpm q` is a thin client for the admin API, authenticated with `FERMI_ADMIN_TOKEN`. Use `--server URL` to target a
deployment. Commands marked ⚠ print question texts or answers: don't run them if you want to play.

| Command                                                          |                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm q add file.json… [--batch id] [--replaces id] [--dry-run]` | Insert, with all checks                                                                      |
| `pnpm q prepare <dir>`                                           | Archive sources, check quotes, dry-run ingest for a directory of drafts                      |
| `pnpm q approve <draft> --notes "…" [--batch id]`                | The verifier's OK: stamp the draft verified, save it and ingest it                           |
| `pnpm q reject (--draft <file> \| --question "…") --reason "…"`  | Remember a rejected candidate                                                                |
| `pnpm q reword <id> --question "…" [--unit "…"] --reason "…"`    | Replace a question with a clearer wording of the same fact (`<id>-v2`)                       |
| `pnpm q flag <flag> <id…> [--remove]`                            | Add or remove a flag, e.g. `reviewed:v1`, on questions                                       |
| `pnpm q purge [--yes]`                                           | Delete retired versions replaced by a newer one and never played (preview without `--yes`)   |
| `pnpm q list [--all]`                                            | IDs, categories and statuses (retired ones only with `--all`)                                |
| `pnpm q list --texts` ⚠                                          | The same, with question texts (never answers)                                                |
| `pnpm q get <id>` ⚠                                              | A question's full JSON                                                                       |
| `pnpm q stats [--categories]`                                    | Pool counts; `--categories` lists active questions per category                              |
| `pnpm q disputes [file]`                                         | Open disputes (to a file if given)                                                           |
| `pnpm q batch`                                                   | New `.fermi-work` batch plus a sweep of earlier batches (used by the skill)                  |
| `pnpm q check [--links]`                                         | Re-validate the pool and live sources (a server-side job; the CLI polls)                     |
| `pnpm q status <id> active\|retired\|disputed`                   | Change a question's status                                                                   |
| `pnpm q archive <url>`                                           | Find or create a Wayback snapshot                                                            |
| `pnpm q quote <url> "<quote>" [n]` ⚠                             | Check a quote is on the page and contains `n`; prints the text around it                     |
| `pnpm q export [file]` ⚠ / `pnpm q import <file>`                | Backup and restore (see below)                                                               |
| `pnpm q voice [--sweep]`                                         | FerMEANie's voice: clips rendered and queued, counts only (`--sweep` renders what's missing) |

`import` **merges**: it keeps statuses and flags, skips ids the target already has, de-duplicates the rest, merges
rejections, and is safe to run repeatedly.

Every insert goes through `apps/server/src/questions/ingest.ts`:

- **Schema and dates:** zod validation; the snapshot must be within 7 days of the access date.
- **Quotes and formulas:** the quote must contain the number; a derived formula must evaluate to the answer; each
  derived input must be set in the formula and appear in its cited quote.
- **Duplicates:** text similarity, the same source passage, or the same answer with related wording. Grey-zone
  matches return `409 needs_review` and can be cleared with `distinctFrom` + `distinctReason`. Rejected candidates are
  remembered.

**Quality review.** `pnpm review` checks the pool the way a player sees it (category, question and unit only): would a
stranger know what to estimate and have something to reason from, is it unambiguous? Haiku screens about 40 questions per
call; Sonnet looks only at the flagged ones, with their sources, and keeps, rewords (`pnpm q reword`: same fact, new
id, the old one retired) or retires them. Every finished question gets the flag `reviewed:v1`, so later runs only look
at new questions; bump `REVIEW_FLAG` in `scripts/review.ts` to review everything again after a rules change. It
prints only ids, issue codes, counts and cost (about $0.25 per 100 questions). `--dry-run` decides without changing
anything; `--limit N` caps how many questions it screens; `--show` also prints each flagged question's wording before
and after (a spoiler for those questions; answers are never printed). A decision that can't be applied (the
rewording is too long or gives away the answer, or ingest refuses it) flags the question `review-unresolved:v1`, so
it isn't paid for again on every run; `--retry-unresolved` looks at those again.

**Retired questions** are never asked, but they stay in the database: they keep the generator from writing the same
question again, and keep `/q/<id>` links from old games working. `pnpm q purge` deletes only those that are safe to
drop: versions replaced by a newer one (which still guards the same fact) and never played.

Players can **dispute** an answer from the recap or `/q/:id` page. The first dispute only flags a question; it leaves
rotation once two different players who were dealt it have disputed it, until `/fermi-questions --recheck` resolves it.
Disputes from anyone else are kept for the recheck but don't count.

## Self-hosting

| Variable                  | Default                                        | What it does                                                                                |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `FERMI_ADMIN_TOKEN`       | none                                           | Bearer token for the question admin API. Required to add questions.                         |
| `FERMI_CLAUDE_CONFIG_DIR` | none                                           | Claude config dir of the account `pnpm grow` runs bill. Required by `pnpm grow`.            |
| `FERMI_ARCHIVE_KEYS`      | none                                           | archive.org S3 keys (`access:secret`, from archive.org/account/s3.php) for faster archiving |
| `FERMI_ARCHIVE_SLOTS`     | `3` (a new account's logged-in limit)          | How many Wayback captures may run at once, across all runs                                  |
| `FERMI_DB`                | `./data/fermi.db` (`/data/fermi.db` in Docker) | Where the SQLite database lives                                                             |
| `PORT`                    | `3000`                                         | The server's port                                                                           |
| `HOST`                    | `0.0.0.0`                                      | The address the server listens on                                                           |
| `FERMI_SERVER`            | `http://localhost:3000`                        | Where `pnpm q` sends requests                                                               |
| `FERMI_TRUST_PROXY`       | off                                            | Set to `1` behind a reverse proxy, so rate limits see the real client address               |
| `FERMI_TIME_SCALE`        | `1`                                            | Speeds up reveals and breaks; for tests only                                                |
| `FERMI_VOICE`             | off                                            | `1` turns on FerMEANie's voice (see [content/VOICE.md](content/VOICE.md))                   |
| `FERMI_VOICE_DIR`         | `voice/` next to the database                  | Where her voice's clips are kept                                                            |

- **Fully self-hosted.** The game loads nothing from other servers: no CDNs, web fonts, analytics or icon services. It
  works with access to the game server alone, even on a closed LAN. The server's `Content-Security-Policy` makes
  browsers refuse anything else, and the e2e test fails if any request leaves the game's origin. (Histoire, the
  component-story dev tool, does load icons online, but it isn't part of the game.)
- **Players are identified by a private key** kept in each browser's localStorage. It is only ever sent to the server
  and stored there as a hash. Other players see a random per-room id, which can't be used to act as someone else.
- **Answers can't be looked up mid-round.** `/q/:id` only shows a question once it has been played, and not while a
  room is playing it.
- **Rate limits** (per client): 10 new rooms per minute and 20 disputes per hour, with at most 2000 open rooms.

## Development

```bash
pnpm check          # what CI checks: format, lint, types, unit tests
pnpm test:e2e       # Playwright: three browsers (one emulating a phone) play a whole game
pnpm test:e2e:video # the same with FerMEANie's voice, recording each browser to test-results/<test>/videos/ (no sound)
                    # PW_VIDEO=1 / FERMI_VOICE=1 do either alone; the voice needs uv and ffmpeg
# to watch (and hear) a game: FERMI_TIME_SCALE=1 FERMI_VOICE=1 pnpm exec playwright test --headed -g "big screen"
# (PW_SLOWMO=500 adds a pause before every click and keystroke)
pnpm format         # Prettier (pnpm format:check to only check)
pnpm lint           # ESLint for TS + Vue (pnpm lint:fix to autofix)
pnpm story:dev      # Histoire stories for every component; "Screens / Devices" shows each screen at 360, 390 and 1280 px
```

Editor settings are in `.editorconfig`. Ideas that aren't scheduled yet live in [`IDEAS.md`](IDEAS.md): pick one from
there, or add your own.

### CI and automation (`.github/`)

- **CI** (`workflows/ci.yml`) runs on every PR and push to `master`: format, lint, type check and unit tests;
  Playwright e2e (report uploaded on failure); client, stories and Docker image builds (not pushed). A final `ci-ok`
  job sums it up; that is the one check to require.
- **Dependabot** (`dependabot.yml`) opens weekly, grouped PRs for npm packages, GitHub Actions and the Docker base
  image. Patch and minor updates merge automatically once `ci-ok` passes (`workflows/dependabot-auto-merge.yml`);
  majors wait for review.
- **Stories** (`workflows/stories.yml`) publishes the Histoire stories to GitHub Pages on pushes to `master`. They use
  only fake fixtures, never real questions.

### Code layout

| Path              |                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Calculator (tokenizer → Pratt parser → evaluator → formatting), scoring, crowd maths, protocol, question schemas, and the Fluent line loader |
| `apps/server`     | Hono HTTP + `ws`, SQLite (`node:sqlite`) with migrations, the room state machine, FerMEANie's line picker, question ingest                   |
| `apps/client`     | Vue 3 + Vite. Views are pure (props in, events out); `useSocket` owns the connection. Stories and fixtures live next to the components.      |
| `content/`        | Question rules and templates, FerMEANie's lines (`fermeanie/*.ftl`) and persona guide ([`FERMEANIE.md`](content/FERMEANIE.md))               |

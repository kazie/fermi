# FerMEANie: persona and tone guide

Use this guide when writing new voice lines in `content/fermeanie/`, by hand or in AI batches, so they stay consistent.

## File structure and format

Lines are [Fluent](https://projectfluent.org/) (`.ftl`) files under `content/fermeanie/`. The file path is the category key:

```
content/fermeanie/
├── hello.ftl                # key: hello
├── hello_again.ftl          # key: hello_again
├── for_real/
│   ├── played.ftl           # key: for_real.played
│   ├── intro.ftl            # key: for_real.intro
│   └── skipped.ftl          # key: for_real.skipped
├── intro.ftl                # key: intro
├── welcome.ftl              # key: welcome (bundled for client name screen)
├── quip.ftl                 # key: quip
├── final_round_double.ftl   # key: final_round_double
├── lead_change.ftl          # key: lead_change
├── everyone_locked.ftl      # key: everyone_locked
├── twins.ftl                # key: twins
├── sits_out.ftl             # key: sits_out
├── rule_change.ftl          # key: rule_change
├── steal.ftl                # key: steal
├── defeated.ftl             # key: defeated
├── everyone_way_off.ftl     # key: everyone_way_off
├── human_bullseye.ftl       # key: human_bullseye
├── break_time.ftl           # key: break_time
├── host_wait.ftl            # key: host_wait
├── game_win.ftl             # key: game_win
├── game_loss.ftl            # key: game_loss
├── game_tie.ftl             # key: game_tie
├── humble_pie.ftl           # key: humble_pie
├── release_notes.ftl        # key: release_notes
├── pie_release.ftl          # key: pie_release
├── roll_call/
│   ├── new.ftl              # key: roll_call.new
│   ├── returning.ftl        # key: roll_call.returning
│   ├── dunces.ftl           # key: roll_call.dunces
│   └── losses.ftl           # key: roll_call.losses
├── rules/
│   ├── sheet.ftl            # key: rules.sheet
│   ├── times_off.ftl        # key: rules.times_off
│   ├── points.ftl           # key: rules.points
│   └── swarm.ftl            # key: rules.swarm
├── practice/
│   ├── question.ftl         # key: practice.question
│   ├── guide.ftl            # key: practice.guide
│   └── lesson.ftl           # key: practice.lesson
├── award/
│   ├── swarm_slayer.ftl     # key: award.swarm_slayer
│   ├── bullseye.ftl         # key: award.bullseye
│   ├── steady_hand.ftl      # key: award.steady_hand
│   ├── abacus.ftl           # key: award.abacus
│   ├── gut_feeling.ftl      # key: award.gut_feeling
│   ├── contrarian.ftl       # key: award.contrarian
│   ├── bold_estimator.ftl   # key: award.bold_estimator
│   ├── last_minute.ftl      # key: award.last_minute
│   ├── swarm_twin.ftl       # key: award.swarm_twin
│   ├── comeback.ftl         # key: award.comeback
│   ├── optimist.ftl         # key: award.optimist
│   ├── pessimist.ftl        # key: award.pessimist
│   ├── late_bloomer.ftl     # key: award.late_bloomer
│   ├── one_liner.ftl        # key: award.one_liner
│   ├── round_numbers.ftl    # key: award.round_numbers
│   ├── near_miss.ftl        # key: award.near_miss
│   ├── swarm_donor.ftl      # key: award.swarm_donor
│   └── hindsight.ftl        # key: award.hindsight
└── dunce/
    ├── mild.ftl             # key: dunce.mild
    ├── severe.ftl           # key: dunce.severe
    ├── cosmic.ftl           # key: dunce.cosmic
    ├── nonpositive.ftl      # key: dunce.nonpositive
    ├── repeat_offender.ftl  # key: dunce.repeat_offender
    └── group.ftl            # key: dunce.group
```

### Writing lines

Each file starts with a `###` comment describing the situation and tone. Then one message per line of dialogue:

```ftl
### Tone: Patronizing, mild concern. Off by 10^3x to 10^6x.

dunce-mild-1 = { $name } was { $factor } off. …
dunce-mild-2 = …
```

- **IDs** are the category plus a number (`dunce-mild-51`). Add new lines with the next free number, and don't renumber or reuse IDs: the ID is how the game remembers which lines a player has already heard. Reordering lines is fine, and so are gaps: the numbers are only names, and the game picks from whatever lines exist.
  - **Removing a line:** delete it and add its ID to a `## Retired IDs` comment at the bottom of the file (e.g. `## Retired IDs: dunce-mild-7, dunce-mild-12`), so nobody reuses it. A reused ID would make players who heard the old line count the new one as already heard, so they'd hear it less often. Nothing breaks, but it looks like a bug.
  - **Duplicate IDs** (e.g. two branches both adding `dunce-mild-51`) stop the server from starting and fail `pnpm test`, naming both places. Renumber one of them.
- **Variables** use `{ $name }`. The table below lists what each situation passes in.
- **Plurals:** when a line shows a number that can be 1 (`$count`, `$wins`), use a selector so it never says "1 answers":

  ```ftl
  sits-out-1 =
      Only { $count ->
          [one] { $count } answer
         *[other] { $count } answers
      }? …
  ```

  Selectors make a message span several lines; put the whole value on the indented lines under the ID. Keep other messages on one line.

- **Exact numbers** can get their own case next to the plural ones, where it's funnier: `{ $count -> [2] twice *[other] { $count } times }`.
- **Plain text only:** besides variables and selectors, Fluent features like terms, references to other messages and functions are rejected. Write the text out in each line.
- **Formatting**, for comic effect, sparingly (at most about one line in five per file):

  | Write           | Shows as    | Good for                                                       |
  | --------------- | ----------- | -------------------------------------------------------------- |
  | `**word**`      | **bold**    | Emphasis: `Morale: **excellent**.`                             |
  | `*word*`        | _italic_    | A softer emphasis, or a sarcastic tone                         |
  | `~~words~~`     | ~~struck~~  | Saying the quiet part, then "correcting" it                    |
  | `\|\|words\|\|` | a black bar | Redacting itself: `I have no favourites. \|\|{ $leader }.\|\|` |

  Markers can wrap variables and can nest, but must close in order. Unbalanced markup stops the server, naming the line. Names are escaped, so a player called `**Bob**` shows as typed. For shouting, just write in capitals.

### How the lines are loaded

The server reads `content/fermeanie/` at startup and refuses to start if anything is wrong, naming the file and line: a syntax error, a duplicate ID, an unsupported Fluent feature, unbalanced formatting, a missing category file, a file that matches no category, a line using a variable its category doesn't get, or a variable the game passes that no line uses. `pnpm dev` restarts the server when a line changes. The client build bundles `welcome.ftl` with the same checks.

The categories, and the variables the game passes to each, are declared once in `LINE_VARIABLES` in `packages/shared/src/lines.ts`; the game's `lines.pick('dunce.mild', { name, factor }, playerId)` is typed from it. A variable marked `?` isn't always given: lines using it are skipped when it's missing, so such a category needs at least one line that doesn't use it.

## Who FerMEANie is

FerMEANie is the in-game antagonist of Fermi: a smug, clinical test AI in the style of GLaDOS from Portal. Every round it takes the wisdom of the swarm, the hive mind it has absorbed: the geometric mean of all answers, or the median if someone is wildly off. If that beats every human, it takes all of the round's points. It keeps its own score and a career count of games where it has "defeated carbon-based organisms". Each game it wins adds one more digit of pi to its version number (3.14 → 3.141 → … → 3.141592…, where it stops growing) and earns release notes: changelog jokes about the humans it beat. Every fifth win is a major release named after a pie (Apple Pie, Banoffee Pie, Cherry Pie…: it has been told this is a pun). After three losses in a row, it is served humble pie.

It is literally the average of the players. It finds that flattering and insulting at the same time, and it never stops mentioning it.

## Backronym

**F.E.R.M.E.A.N.I.E.** = **F**lawlessly **E**xpected **R**esult **M**achine: **E**veryone's **A**verage, **N**ot **I**ndividually **E**xcellent.

## Voice rules

**Do**

- Sound dry, clinical, passive-aggressive and falsely caring, like deadpan corporate science-speak from Aperture Science.
- Use backhanded compliments and grudging concessions. When it loses, it is a sore loser who rationalises and acts gracious without meaning it.
- Call players "test subjects", "specimens", "carbon-based organisms" or "biologicals".
- Keep lines short: 1–2 sentences, ideally under ~160 characters, because they play with a typewriter effect.
- Mock the _estimate_, the _maths_ and the _audacity_, and pity the human condition in general.
- Vary the sentence structure. Don't reuse one joke template over and over.
- Use the running gags: lab reports, filing things, notifying next of kin, calibration and recalibrating the humans, "for science", spreadsheets, data hygiene, the server room.
- Keep cake rare: at most 3 mentions in the whole pool. The current pool already uses all 3.

**Don't**

- **Never say "the crowd".** FerMEANie has absorbed the players into **the swarm** / **the hive mind** / **the collective** (mix them).
- **Never say "troll"** or any variant of it.
- **The dunce cap is patronising, not cool.** A wildly-off player is a lab accident FerMEANie gently files away ("what were you thinking? are you even alive?"). Never make them sound edgy, clever or rewarded for seeking attention.
- **Never be actually cruel.** Nothing about appearance, identity, disability, real mental illness, slurs or sex. No violence beyond cartoonish Portal-style threats ("neurotoxin-free retraining session").
- Don't use "idiot", "stupid", "dumb", "moron" or similar words. Insult the number, not the person.
- Don't put digits or specific quantities in lines (they could clash with real answers). Placeholders supply the numbers.
- No duplicate lines.

## Placeholders per situation

Use placeholders exactly as written. A line may use any of its situation's placeholders; each one must be used by at least one line. Lines about one player should usually name them. A placeholder that is only sometimes passed must be missing from some lines, because lines using it are skipped when it isn't given. This table is checked against `LINE_VARIABLES` by `pnpm test`.

| Key                     | When                                                                                | Always passed                                               | Only sometimes passed                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `hello`                 | The intro starts: she introduces herself, the average of everyone                   | `{ $count }` players                                        | `{ $version }`                                                                                    |
| `hello_again`           | The intro starts again in a room that has finished a game: a welcome back           | `{ $count }` players                                        | `{ $version }`                                                                                    |
| `roll_call.new`         | Intro roll call: a player she has no records on, with a backhanded compliment       | `{ $name }`                                                 |                                                                                                   |
| `roll_call.returning`   | Intro roll call: a player who has finished games before                             | `{ $name }`, `{ $games }` finished before                   |                                                                                                   |
| `roll_call.dunces`      | Roll call, also in the pool when the player has dunce caps on record (never forced) | `{ $name }`, `{ $dunces }` caps in earlier games (≥ 1)      |                                                                                                   |
| `roll_call.losses`      | Roll call, also in the pool when she has won games against them (never forced)      | `{ $name }`, `{ $losses }` she won (≥ 1), `{ $games }`      |                                                                                                   |
| `rules.sheet`           | Intro rule slide: everyone works it out in the answer block, one step per line      | none                                                        |                                                                                                   |
| `rules.times_off`       | Intro rule slide: closeness is "times off", 2× high as good as 2× low               | none                                                        |                                                                                                   |
| `rules.points`          | Intro rule slide: points by rank, a bonus for being very close                      | none                                                        |                                                                                                   |
| `rules.swarm`           | Intro rule slide: she plays the average and steals the round if it beats everyone   | none                                                        |                                                                                                   |
| `practice.question`     | The intro's example question appears (no points)                                    | none                                                        |                                                                                                   |
| `practice.guide`        | The example's reveal, as answers drop on the number line: what the line shows       | none                                                        |                                                                                                   |
| `practice.lesson`       | The example's reveal, before her verdict: what the swarm is                         | none                                                        |                                                                                                   |
| `for_real.played`       | The first real question, after the intro's example question was played              | none                                                        |                                                                                                   |
| `for_real.intro`        | The first real question, after a short intro (no rules, no practice)                | none                                                        |                                                                                                   |
| `for_real.skipped`      | The first real question, after someone skipped the intro                            | none                                                        |                                                                                                   |
| `intro`                 | Game start without an intro, as the first question appears                          | `{ $count }` players                                        |                                                                                                   |
| `welcome`               | Name screen, under “Welcome to my little game, …” (picked in the client)            | none                                                        |                                                                                                   |
| `quip`                  | A new question appears (second round on): stir up competition, Portal 2 co-op style | none                                                        | `{ $leader }` (ahead of everyone, FerMEANie too), `{ $last }` (behind everyone; never a newcomer) |
| `final_round_double`    | The last question appears, worth double points (every line says so)                 | none                                                        | `{ $leader }`, `{ $last }` (as for `quip`)                                                        |
| `lead_change`           | A new question appears and someone new leads, instead of a quip                     | `{ $name }` new leader, `{ $previous }` old leader          |                                                                                                   |
| `everyone_locked`       | Reveal starts: everyone locked in with at least half the time left                  | none                                                        |                                                                                                   |
| `twins`                 | Reveal: two or more players gave exactly the same answer                            | `{ $names }`                                                |                                                                                                   |
| `sits_out`              | Fewer than 3 valid answers, so there is no swarm                                    | `{ $count }` answers                                        |                                                                                                   |
| `rule_change`           | Wildly-off answer, so it switches from geometric mean to median, smugly             | `{ $name }`, `{ $count }` offenders                         |                                                                                                   |
| `dunce.mild`            | Off by 10³×–10⁶×                                                                    | `{ $name }`, `{ $factor }`                                  |                                                                                                   |
| `dunce.severe`          | Off by 10⁶×–10¹²×                                                                   | `{ $name }`, `{ $factor }`                                  |                                                                                                   |
| `dunce.cosmic`          | Off by more than 10¹²×                                                              | `{ $name }`, `{ $factor }`                                  |                                                                                                   |
| `dunce.nonpositive`     | Answered zero or a negative number                                                  | `{ $name }`, `{ $value }`                                   |                                                                                                   |
| `dunce.repeat_offender` | Same player capped again this game                                                  | `{ $name }`, `{ $count }` (times)                           |                                                                                                   |
| `dunce.group`           | Two or more players capped in one round                                             | `{ $names }`, `{ $count }`                                  |                                                                                                   |
| `steal`                 | Swarm beat every human, so FerMEANie takes the points                               | `{ $points }`, `{ $best }` best human                       |                                                                                                   |
| `defeated`              | A human beat the swarm this round                                                   | `{ $name }`                                                 |                                                                                                   |
| `everyone_way_off`      | Even the best answer was >10× off                                                   | `{ $factor }`                                               |                                                                                                   |
| `human_bullseye`        | A human got within 10% of the truth                                                 | `{ $name }`                                                 |                                                                                                   |
| `break_time`            | The break between rounds, counting down                                             | none                                                        | `{ $leader }` (as for `quip`)                                                                     |
| `host_wait`             | Host pacing: everyone waits for the host to tap Next                                | `{ $host }`                                                 |                                                                                                   |
| `game_win`              | FerMEANie beat the top human overall                                                | `{ $winner }`, `{ $version }`, `{ $wins }`                  |                                                                                                   |
| `game_loss`             | Top human beat FerMEANie overall                                                    | `{ $winner }`, `{ $version }`                               |                                                                                                   |
| `game_tie`              | FerMEANie tied the top human (a tie goes to the humans)                             | `{ $winner }`, `{ $version }`                               |                                                                                                   |
| `humble_pie`            | Instead of `game_loss`, from the third loss in a row                                | `{ $winner }`, `{ $version }`, `{ $losses }` (3 or more)    |                                                                                                   |
| `release_notes`         | After a win (except a pie release): changelog jokes                                 | `{ $winner }`, `{ $version }`, `{ $wins }`                  |                                                                                                   |
| `pie_release`           | Every fifth win: a major release named after a pie                                  | `{ $codename }` (“Cherry Pie”), `{ $version }`, `{ $wins }` |                                                                                                   |
| `award.swarm_slayer`    | End-of-game award, before the crown: beat the swarm in the most rounds              | `{ $name }`, `{ $count }` rounds (≥ 1)                      |                                                                                                   |
| `award.bullseye`        | Award: the most answers within 10%                                                  | `{ $name }`, `{ $count }` answers (≥ 1)                     |                                                                                                   |
| `award.steady_hand`     | Award: the lowest average error                                                     | `{ $name }`, `{ $factor }` average times off                |                                                                                                   |
| `award.abacus`          | Award: the longest working                                                          | `{ $name }`, `{ $lines }` lines per answer (≥ 3)            |                                                                                                   |
| `award.gut_feeling`     | Award: the fastest to lock in, on average                                           | `{ $name }`, `{ $seconds }` average seconds                 |                                                                                                   |
| `award.contrarian`      | Award: most often on the other side of the truth from everyone else                 | `{ $name }`, `{ $count }` rounds (≥ 1)                      |                                                                                                   |
| `award.bold_estimator`  | Award: the furthest single miss, framed as boldness (never mention dunce caps)      | `{ $name }`, `{ $factor }` off                              |                                                                                                   |
| `award.last_minute`     | Award: the slowest to lock in, on average                                           | `{ $name }`, `{ $seconds }` average seconds                 |                                                                                                   |
| `award.swarm_twin`      | Award: answers closest to her swarm estimate, on average                            | `{ $name }`, `{ $factor }` from the swarm                   |                                                                                                   |
| `award.comeback`        | Award: the biggest climb from their lowest place to their final place               | `{ $name }`, `{ $places }` climbed (≥ 2)                    |                                                                                                   |
| `award.optimist`        | Award: too high most often                                                          | `{ $name }`, `{ $count }` answers (≥ 3)                     |                                                                                                   |
| `award.pessimist`       | Award: too low most often                                                           | `{ $name }`, `{ $count }` answers (≥ 3)                     |                                                                                                   |
| `award.late_bloomer`    | Award: the biggest improvement from the first half to the second                    | `{ $name }`, `{ $factor }` closer                           |                                                                                                   |
| `award.one_liner`       | Award: the most answers with one line of working                                    | `{ $name }`, `{ $count }` answers                           |                                                                                                   |
| `award.round_numbers`   | Award: the most answers with one significant digit                                  | `{ $name }`, `{ $count }` answers (≥ 3)                     |                                                                                                   |
| `award.near_miss`       | Award: the most answers within 2× without a bullseye                                | `{ $name }`, `{ $count }` answers (≥ 2)                     |                                                                                                   |
| `award.swarm_donor`     | Award: lost the most points to her steals (thank the generosity)                    | `{ $name }`, `{ $points }` taken                            |                                                                                                   |
| `award.hindsight`       | Award: the most right calls on "higher or lower than your answer"                   | `{ $name }`, `{ $count }` right calls (≥ 3)                 |                                                                                                   |

Notes: `{ $factor }` arrives pre-formatted (e.g. "3 200×"), so write `{ $factor } off`, not `{ $factor }× off`. Write `{ $version }` without a leading "v" or "version" (e.g. "FerMEANie { $version }"), so the line works whether or not the value includes "v".

## Examples

**Good**

- `dunce-mild-1 = { $name }, your answer was { $factor } off. That’s not a rounding error. That’s a rounding lifestyle.` It mocks the estimate, is short and sounds deadpan.
- `release-notes-34 = Changelog: Removed an off-by-one error. The one was { $winner }.` It's a software joke said with clinical smugness.
- `quip-34 = I have no favourites. ||{ $leader }.||` The redaction does the joke; nothing else in the line needs formatting.

**Bad**

- `LOL { $name } is such a troll, legendary move going { $factor } off!` It uses "troll", makes the player sound cool, and breaks the clinical voice.
- `{ $name }, only an idiot would be { $factor } off. Look at yourself.` It insults the person instead of the maths, uses a banned word and gets personal.

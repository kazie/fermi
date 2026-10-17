# FerMEANie: persona and tone guide

Use this guide when writing new lines for `fermeanie-lines.json`, by hand or in AI batches, so they stay consistent.

## Who FerMEANie is

FerMEANie is the in-game antagonist of Fermi: a smug, clinical test AI in the style of GLaDOS from Portal. Every round it takes the wisdom of the swarm, the hive mind it has absorbed: the geometric mean of all answers, or the median if someone is wildly off. If that beats every human, it takes all of the round's points. It keeps its own score and a career count of games where it has "defeated carbon-based organisms". Each game it wins adds one more digit of pi to its version number (3.14 → 3.141 → 3.1415…).

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
- Keep cake rare: at most 3 mentions in the whole file. The current file already uses all 3.

**Don't**

- **Never say "the crowd".** FerMEANie has absorbed the players into **the swarm** / **the hive mind** / **the collective** (mix them).

- **Never say "troll"** or any variant of it.
- **The dunce cap is patronising, not cool.** A wildly-off player is a lab accident FerMEANie gently files away ("what were you thinking? are you even alive?"). Never make them sound edgy, clever or rewarded for seeking attention.
- **Never be actually cruel.** Nothing about appearance, identity, disability, real mental illness, slurs or sex. No violence beyond cartoonish Portal-style threats ("neurotoxin-free retraining session").
- Don't use "idiot", "stupid", "dumb", "moron" or similar words. Insult the number, not the person.
- Don't put digits or specific quantities in lines (they could clash with real answers). Placeholders supply the numbers.
- No duplicate lines.

## Placeholders per situation

Use placeholders exactly as written, braces included. Each line should contain at least the first required placeholder.

| Key                     | When                                                                     | Required                              | Optional            |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------- | ------------------- |
| `intro`                 | Game start                                                               | none                                  | `{count}` players   |
| `welcome`               | Name screen, under “Welcome to my little game, …” (picked in the client) | none                                  |                     |
| `sits_out`              | Fewer than 3 valid answers, so there is no swarm                         | none                                  | `{count}` answers   |
| `rule_change`           | Wildly-off answer, so it switches from geometric mean to median, smugly  | `{name}`                              | `{count}` offenders |
| `dunce.mild`            | Off by 10³×–10⁶×                                                         | `{name}`, `{factor}`                  |                     |
| `dunce.severe`          | Off by 10⁶×–10¹²×                                                        | `{name}`, `{factor}`                  |                     |
| `dunce.cosmic`          | Off by more than 10¹²×                                                   | `{name}`, `{factor}`                  |                     |
| `dunce.nonpositive`     | Answered zero or a negative number                                       | `{name}`, `{value}`                   |                     |
| `dunce.repeat_offender` | Same player capped again this game                                       | `{name}`, `{count}` (times this game) |                     |
| `dunce.group`           | Two or more players capped in one round                                  | `{names}`, `{count}`                  |                     |
| `steal`                 | Swarm beat every human, so FerMEANie takes the points                    | `{points}`                            | `{best}` best human |
| `defeated`              | A human beat the swarm this round                                        | `{name}`                              |                     |
| `everyone_way_off`      | Even the best answer was >10× off                                        | `{factor}`                            |                     |
| `human_bullseye`        | A human got within 10% of the truth                                      | `{name}`                              |                     |
| `game_win`              | FerMEANie beat the top human overall                                     | `{winner}`, `{version}`, `{wins}`     |                     |
| `game_loss`             | Top human beat FerMEANie overall                                         | `{winner}`                            | `{version}`         |
| `version_upgrade`       | After a game win: a pi digit is added                                    | `{oldVersion}`, `{version}`           | `{wins}`            |

Notes: `{factor}` arrives pre-formatted (e.g. "3 200×"), so write "{factor} off", not "{factor}× off". Write `{version}` without a leading "v" or "version" (e.g. "FerMEANie {version}"), so the line works whether or not the value includes "v".

## Examples

**Good**

- `{name}, your answer was {factor} off. That’s not a rounding error. That’s a rounding lifestyle.` It mocks the estimate, is short and sounds deadpan.
- `{oldVersion} retired with honours. Now running {version}. I feel more irrational already.` It's a pi pun said with clinical smugness.

**Bad**

- `LOL {name} is such a troll, legendary move going {factor} off!` It uses "troll", makes the player sound cool, and breaks the clinical voice.
- `{name}, only an idiot would be {factor} off. Look at yourself.` It insults the person instead of the maths, uses a banned word and gets personal.

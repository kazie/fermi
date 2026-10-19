# Ideas

Ideas worth doing, not scheduled yet. Pick one, build it, then remove it from this list. Add new ones with a line
on why they'd be fun or useful.

## Gameplay

- **Category picker / question packs** in the lobby. Only worth it once the pool is big enough that a pack still
  fills a game.
- **Reactions:** quick emoji taps on reveal cards, shown briefly on every screen. Cheap fun while the cards flip.
- **Shareable recap image** at the end of a game (rendered client-side, no external services).
- **Lifetime stats and badges:** most dunce caps, best bullseye, longest streak against the swarm. Players already
  have stable ids, so this is mostly queries over `games`.
- **Tie ordering.** The client orders tied players differently from the server's `byStanding` (score, then name).
  Make them match.

## FerMEANie

- **Head-to-head record per player.** "Ada. Our record: 3–5. To me." Uses the player id and the `games` table.
- **Lobby lines from the server,** e.g. greeting a returning player with their history (dunce count, last game).
  Needs a line picker outside a game; lobby texts are hard-coded in the client today.
- **More moments:** streaks (beat the swarm N rounds in a row), a comeback from last place, FerMEANie taking the
  lead, the game ending early because the questions ran out, play again.
- **A voice on the big screen** with the Web Speech API (robotic, opt-in). Fluent attributes could hold a spoken
  variant of a line (`.tts`) where the written one relies on formatting.

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

# Question rules

These rules apply to every question in the Fermi pool, whether a person or an AI wrote it.
Players **will** check the sources after a game, so every number has to survive that.

The ingest API (`pnpm q add`) enforces the mechanical parts automatically: the schema, dates, quote
contains the number, formula matches the answer, and duplicate checks. The judgement parts are listed
here and are the verifier's job.

## 1. What makes a good question

- **It needs estimating, not recall.** "How many rivets hold the Eiffel Tower together?" is good:
  nobody knows it, but everyone can reason about it. "What year was the Eiffel Tower built?" is trivia,
  not a Fermi question.
- **It's fun to reason about.** There should be an obvious way to break it into smaller guesses
  (parts × rivets per part, population × share × frequency…), and an answer that surprises a little.
- **It spans orders of magnitude.** Scoring is in "times off", so it works best when a naive guess
  could plausibly be anywhere from 10× too low to 10× too high.
- **The wording is exact, and matches exactly what the source measures.** The Eiffel Tower is famous
  for _rivets_, not bolts. If the source counts "registered cars" don't ask about "cars". If it is
  "average distance" to the Moon, say "average".
- **The time frame is stated when it matters**: "as of 2024", "in 2023", "per year".
- **The unit is always stated** in `unit` (shown next to the question): `km`, `litres`, `rivets`,
  `people`, `times`, `seconds`…
- **No hidden traps in the wording.** Trivia that only shows up at the reveal is welcome ("1900 was not a leap
  year!"), but the question must not mislead. A trick question is only fair if a careful reader could
  have worked it out.
- **Mix of difficulty** (1 = most people get within 2×, 3 = most are 10× off) **and categories** (see below).
- **International audience.** Most players live outside the US. No US-wide statistics or framing ("in the
  US", American households, US prices, pennies). Country figures are fine when the country is the subject and
  named ("How many islands does Sweden have?"), but never use one country as a stand-in for "people". Famous
  places, landmarks and companies that happen to be in the US are fine (Grand Canyon visitors, Apple's
  revenue). Prices in US dollars are fine for global figures.
- **Metric only**, in the question and in `unit`: km, m, kg, tonnes, litres, °C. No gallons, pounds,
  ounces, miles, feet, acres or °F. If the source uses those, make the question derived and convert in the
  formula (see §2).
- **Recent data.** A fact that drifts must be from the last 5 years (`validAsOf` no older than the current
  year minus 5). Don't dodge the drift by pinning an old year into the wording ("in 2015"): an old year is
  only fine when the history itself is the point (the Eiffel Tower in 1889).
- Ingest rejects non-metric units and US-wide wording in `question` and `unit`, and time-sensitive facts
  older than 5 years. What a word list can't see (a US-only source behind neutral wording) is the
  verifier's job.
- **Avoid** sad or distressing topics (deaths, disasters, crime statistics), politics, anything that
  singles out a group of people, and anything that changes weekly.
- **`fiction` numbers come from official canon**: the books, the studio's or publisher's own guides, or the game
  itself. Fan wikis may point the way, but they are not the source, and fan theories never count.
- **`records` get broken**, so a records question is always `timeSensitive`, with a `recheckAfter` date (ingest
  enforces this).

### Categories

`category` must be exactly one of these; ingest rejects anything else. The list lives in
`packages/shared/src/question.ts` (`CATEGORIES`, `CATEGORY_SCOPES`), and a test keeps this table in step with it.
In a tie, pick the one a player would expect to see above the question.

| Category        | Scope                                                     |
| --------------- | --------------------------------------------------------- |
| `space`         | stars, planets, spaceflight                               |
| `geography`     | land, countries, rivers, mountains                        |
| `cities`        | urban life and infrastructure                             |
| `travel`        | tourism, hotels, visitors                                 |
| `transport`     | vehicles, routes, traffic                                 |
| `nature`        | landscapes, weather, oceans, the planet at large          |
| `plants`        | trees, forests, wild plants                               |
| `farming`       | crops, harvests, livestock                                |
| `animals`       | wild and farm animals                                     |
| `pets`          | animals kept by people                                    |
| `bugs`          | insects and spiders                                       |
| `biology`       | cells, genes, life in general                             |
| `human-body`    | our own bodies                                            |
| `prehistory`    | dinosaurs, fossils, early humans                          |
| `history`       | recorded history                                          |
| `food`          | eating and cooking                                        |
| `science`       | physics, chemistry, atoms, light, elements                |
| `energy`        | power, fuel, batteries, electricity                       |
| `engineering`   | machines, bridges, tunnels: how things are built and run  |
| `architecture`  | buildings as designed                                     |
| `technology`    | today's digital and electronic world                      |
| `inventions`    | firsts, patents, gadgets                                  |
| `business`      | companies, brands, products                               |
| `economy`       | money, trade, national figures                            |
| `everyday-life` | households, daily routines                                |
| `sport`         | competitive sport                                         |
| `hobbies`       | LEGO, chess, cards, crafts                                |
| `records`       | when the record itself is the point; otherwise its topic  |
| `festivals`     | holidays and traditions                                   |
| `culture`       | customs and anything cultural without a better home       |
| `language`      | words, alphabets, dictionaries                            |
| `books`         | real-world facts about books: sales, lengths, libraries   |
| `art`           | museums, paintings, the stage                             |
| `music`         | songs, streams, instruments, concerts                     |
| `film-tv`       | real-world facts about films and TV: box office, runtimes |
| `games`         | real-world facts about video and board games              |
| `fiction`       | numbers inside a story's world, from official canon       |

## 2. Answers come from sources, never from estimates

**Neither an AI nor a person may estimate an answer.** Every number has to be stated by a citable source.

- **direct**: a source states the answer itself.
  - At least one source quote must contain the answer.
  - Two independent sources that agree are strongly preferred. If they disagree, use the more
    authoritative one and say so in `explanation`.
- **derived**: the answer is calculated from cited facts.
  - Every input number has its own source, and the quote contains that number.
  - The calculation is stored in `formula`, in the game's own calculator syntax, so it can be checked
    and shown at the reveal.
  - Each input is a line `name = value` in the formula, with the value **in the units the source
    uses**. Conversions happen in the formula with definitional constants only
    (`1000`, `60`, `24`, `365`, `pi`…). Exact unit definitions count too: `0.3048` m per foot,
    `1.609344` km per mile, `0.45359237` kg per pound, `3.785411784` litres per US gallon.
  - **No unsourced assumptions.** "Assume a person is 1.7 m tall" is not allowed unless a source
    says that average height is 1.7 m.
  - Prefer derived questions that someone has already published (a Fermi problem book, a "what if"
    article, a university outreach page). Cite that publication too.

### Credible sources, in rough order of preference

1. Official bodies and primary data: national statistics offices, UN/World Bank/WHO, NASA/ESA,
   operators of the thing itself (e.g. the Eiffel Tower's operator), standards bodies.
2. Peer-reviewed papers, and university or museum pages.
3. Encyclopedias (Wikipedia is fine **if the quoted sentence is itself cited there**; prefer
   the underlying source when it's reachable), record books, and reputable newspapers and magazines.
4. Never: content farms, unsourced listicles, social media posts, AI-generated pages, forums.

## 3. Everything is dated

- **`validAsOf`**: when the fact is true (`1889`, `2024`, `2023-07`).
- For every source:
  - **`published`**: the page's own publication or last-updated date, whenever it states one.
  - **`accessed`**: the day you read it (`YYYY-MM-DD`).
  - **`archiveUrl` and `archivedAt`**: a Wayback Machine snapshot from (about) the access date. If none
    exists, create one with Save Page Now (`https://web.archive.org/save/<url>`) and use the
    resulting `https://web.archive.org/web/<14-digit timestamp>/<url>` link. **A source without a snapshot
    is rejected.**
- **`timeSensitive: true`** for facts that drift (populations, records, prices, counts of things
  being built), with **`recheckAfter`** (default: one year after `accessed`). Ingest refuses
  time-sensitive questions without one.

## 4. Quotes

- **Verbatim**: copied character for character from the page, and short (one or two sentences).
- **The quote must contain the number** it backs, written the way the page writes it.
  The checker understands `2,500,000`, `2.5 million`, `2 500 000`, `2.5bn`, `1.2 × 10^9` and
  unit-prefix shifts (km ↔ m, % ↔ fraction).

## 5. Explanation

Shown at the reveal, 1–4 sentences:

- how the number comes about, or a natural way to estimate it;
- one surprising detail, if there is one;
- any caveat ("counts only registered vehicles", "sources differ between 2.5 and 2.6 million").
  It must not contain unsourced numbers that contradict the answer.

## 6. Duplicates

Before writing a question, list what exists (`pnpm q list --texts`, which shows texts only and no answers).
A question is a duplicate if it asks about the **same fact**, however it is worded ("bolts in the Eiffel
Tower" = "rivets holding the Eiffel Tower together"). A different fact about the same subject is fine
(the Eiffel Tower's steps vs its rivets).

When ingest answers `needs_review`, compare the listed questions honestly:

- If it really is different, resubmit with `distinctFrom: [ids]` and a one-sentence `distinctReason`.
- If it's the same fact, drop it.

## 7. JSON shape

```jsonc
{
  "id": "eiffel-tower-rivets", // kebab-case, stable, unique
  "question": "How many rivets hold the Eiffel Tower together?",
  "unit": "rivets",
  "category": "engineering",
  "difficulty": 2, // 1 | 2 | 3
  "kind": "direct", // "direct" | "derived"
  "answer": 2500000, // positive number, in `unit`
  "explanation": "…",
  "validAsOf": "1889",
  "timeSensitive": false,
  "recheckAfter": "2027-10-17", // required when timeSensitive
  "formula": "people = 8.1 billion\n…", // derived only
  "inputs": [{ "name": "people", "value": 8.1e9, "unit": "people", "sourceIds": ["un-pop"] }], // derived only
  "sources": [
    {
      "id": "toureiffel",
      "url": "https://…",
      "title": "…",
      "publisher": "…",
      "quote": "…2,500,000 rivets…",
      "published": "2023", // when stated
      "accessed": "2026-10-17",
      "archiveUrl": "https://web.archive.org/web/20261017093000/https://…",
      "archivedAt": "2026-10-17T09:30:00Z",
    },
  ],
  "verification": {
    "verifiedAt": "2026-10-17T10:00:00Z",
    "verdict": "approved",
    "notes": "Re-fetched both sources; quote present on live page and snapshot; wording matches 'rivets'.",
  },
}
```

## 8. Spoilers

The people running the generator also play. **Never print questions or answers to the terminal or
chat.** Report only counts, IDs and categories.

---
name: fermi-questions
description: Generate, independently verify and ingest new Fermi questions into the running game server (or re-check disputed ones with --recheck). Cheap by design (Haiku drafts, script checks, Sonnet verifies). Safe to run unattended, e.g. `/loop 1h /fermi-questions 5`. Never reveals questions or answers to the user.
argument-hint: '[count=6, max 15] [topic…] | --template <id> [count] | --recheck'
---

# /fermi-questions

You orchestrate. You **don't** search, fetch or read drafts yourself. The work is done by two pinned-model
agents and one script:

| Step                                          | Who                     | Model                                                 |
| --------------------------------------------- | ----------------------- | ----------------------------------------------------- |
| Draft questions                               | `fermi-generator` agent | Haiku (pinned in `.claude/agents/fermi-generator.md`) |
| Archive sources, check quotes, dry-run ingest | `pnpm q prepare`        | none                                                  |
| Judge meaning, wording and fun, then ingest   | `fermi-verifier` agent  | Sonnet (pinned in `.claude/agents/fermi-verifier.md`) |

**Rules:**

- Only spawn those two agent types for this work. Never use `general-purpose`, and never pass a
  `model` override.
- The person running this also plays: never show question texts or answers. Don't read draft JSON,
  `.check.json` files or `existing.tsv` in this conversation. Report counts only.
- Run this from a fresh session if you can. A long coding session makes every orchestration turn
  expensive.

Arguments: `$ARGUMENTS`

- `N`: questions to try to add (default 6; **cap 15**). Other words give an optional topic focus.
- `--template <id> [N]`: a template batch from `content/question-templates.md` (default 6 slots).
- `--recheck`: see the last section.

## 0. Setup

1. Check `pnpm q stats >/dev/null 2>&1`. If it fails, tell the user to start the server (`pnpm dev` or
   the container, with `FERMI_ADMIN_TOKEN` in `.env`) and stop.
2. Set `B=.fermi-work/b-$(date +%Y%m%d-%H%M)` and run
   `mkdir -p $B/drafts $B/verified && pnpm q list --texts > $B/existing.tsv 2>/dev/null`.
3. **Leftovers first.** For each older `.fermi-work/*/drafts/` directory, list its `*.json` drafts
   (not `.check.json`) that have no file with the same name in that batch's `verified/`:
   - drafts older than 7 days: delete them, since their access dates would be stale;
   - otherwise: process that directory through steps 2–3 below before generating anything new, and
     count its successes towards N.

## 1. Draft (Haiku)

Split what is still needed into chunks of **3 drafts**, with about 30% spare. Spawn
`fermi-generator` agents, **at most 2 at a time**, each with a brief like:

> Write 3 drafts into `$B/drafts/`. Avoid facts listed in `$B/existing.tsv`. Topic: <topic or "any:
> vary the categories">.

When the run has no topic, make every third chunk a template chunk:

> Write 3 drafts for template `<id>` from `content/question-templates.md`, with 3 different
> well-known slots not yet in `$B/existing.tsv`.

For `--template`, every chunk is for that template.

## 2. Mechanical checks (no LLM)

`pnpm q prepare $B/drafts`. This archives sources, confirms each quote is on the live page or the
snapshot, and dry-runs ingest. Read only its last line (`x/y drafts passed`) and the ✓/✗ ids it prints.

## 3. Judge and ingest (Sonnet)

Pass only the ✓ drafts to `fermi-verifier`, in chunks of **3**, one agent each, at most 2 at a time:

> Batch `$B`. Check and ingest these drafts: `$B/drafts/<id>.json`, … (their `.check.json` files are next
> to them).

✗ drafts are dropped. Their check files say why, which is useful for tuning the generator later.

Stop once N have been added or the drafts run out. If you're short, run **one** more round of steps
1–3 for the remainder, then stop.

## 4. Report

One line, from the agents' counts and `pnpm q stats` (it prints counts only), e.g.:

`+5 added (geography 2, food 1, space 2) · 2 failed checks · 1 rejected · pool: 61 active`

## --recheck

1. `pnpm q disputes > .fermi-work/recheck.tsv 2>/dev/null`. This lists IDs and messages only.
2. Give the IDs, in chunks of 3, to `fermi-verifier` agents with this brief:

   > Recheck these disputed questions: <ids>. For each, read the dispute (`.fermi-work/recheck.tsv`) and
   > `pnpm q get <id>`, and re-check its sources. Then do one of:
   >
   > - `pnpm q status <id> active --resolution "<why>"`;
   > - fix it: write a corrected JSON with a new id, run `pnpm q prepare` on its directory, then
   >   `pnpm q add <file> --replaces <id>`;
   > - `pnpm q status <id> retired --resolution "<why>"`.
   >
   > Reply with counts only.

3. Report e.g. `Rechecked 4: 2 reactivated, 1 corrected, 1 retired.`

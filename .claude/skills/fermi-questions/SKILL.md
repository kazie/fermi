---
name: fermi-questions
description: Generate, independently verify and ingest new Fermi questions into the running game server (or re-check disputed ones with --recheck). Cheap by design (Sonnet orchestrates, Haiku drafts, script checks, Sonnet verifies). Run it from a fresh Sonnet session; for unattended growth, `pnpm grow` runs the same steps as a script. Never reveals questions or answers to the user.
argument-hint: '[count=6, max 25] [topic…] | --template <id> [count] | --recheck'
model: sonnet
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
  expensive. Don't `/loop` it inside one session either: the context grows every round. For steady
  growth, use `pnpm grow`, which runs these steps as a script, with no orchestrating session at all.
- Other runs may be working in `.fermi-work/` at the same time. Only touch your own batch `$B` and the
  leftover batches `pnpm q batch` claimed for you.
- The `model: sonnet` above only covers the turn that invokes the skill. Every later turn, woken by an
  agent finishing, runs on the session's own model. If that isn't Sonnet, say once at the start that
  the user can run `/model sonnet` first, or `claude -p --model sonnet`, to keep the whole run cheap.

Arguments: `$ARGUMENTS`

- `N`: questions to try to add (default 6; **cap 25**). Other words give an optional topic focus.
- `--template <id> [N]`: a template batch from `content/question-templates.md` (default 6 slots).
- `--recheck`: see the last section.

## 0. Setup

Run every command as a plain `pnpm q …` call, with literal paths: no shell variables, `$(…)`,
redirects, pipes or `&&`. Headless runs (`claude -p`) only allow plain `pnpm q` commands, and deny anything
else without asking. `$B` below stands for the batch path that `pnpm q batch` prints. Write it out in full.

1. `pnpm q batch`. If it fails because the server can't be reached, tell the user to start the server
   (`pnpm dev` or the container, with `FERMI_ADMIN_TOKEN` in `.env`) and stop.
   It prints `batch <path>`; that path is `$B`. It writes `$B/existing.tsv` and `$B/categories.tsv`, which
   hold ids, categories and counts only, no question texts: generators don't need the texts, because the
   `prepare` step below catches duplicates on the server. It also deletes unverified drafts older than 7 days
   from earlier batches, since their access dates would be stale.
2. `date -u +%F`: today's date, for the briefs (generators have no shell).
3. **Leftovers.** Each `leftover <dir> <n> pending` line is a batch whose run died; `pnpm q batch` has
   claimed it for you, so no other run will touch it. Put `<dir>/drafts` through steps 2–3 alongside
   your own drafts, and count its successes towards N.

## 1. Draft (Haiku)

Split what is still needed into chunks of **5 drafts** (template chunks: 6), with about 10% spare. Spawn
`fermi-generator` agents, **up to 4 at a time**, each with a brief like:

> Write 5 drafts into `$B/drafts/`. Existing ids and categories: `$B/existing.tsv`; questions per
> category: `$B/categories.tsv`. Topic: <topic, or "any: favour the categories with the fewest
> questions">. Today is <date>.

When the topic is several category names (e.g. `space history`), give each chunk **one** of them, in
turn. A combined topic lets the generator pick whichever is easier, and the other one gets nothing.

When the run has no topic, make every third chunk a template chunk:

> Write 6 drafts for template `<id>` from `content/question-templates.md`, from one source table if you
> can, with 6 different well-known slots not yet in `$B/existing.tsv` (ids name the slot). Today is <date>.

For `--template`, every chunk is for that template.

## 2. Mechanical checks (no LLM), as each generator finishes

Don't wait for all generators. Each time one finishes, run `pnpm q prepare $B/drafts` (and the same for
any leftover batch). It skips drafts a verifier already approved or rejected, and only re-checks drafts changed since
their last check, so repeated calls are cheap. It archives sources, confirms each quote is on the live page
or the snapshot, and dry-runs ingest. Read only its last line (`x/y drafts passed`) and the ✓/✗ ids it
prints. A `… <id>: not ready` line is a draft still being written: it's checked on a later call. Run one
`prepare` at a time (never two in parallel); a second call waits for the first anyway.

## 3. Judge and ingest (Sonnet), as soon as drafts pass

Keep a list of the ids you've already sent to verifiers. After each `prepare`, pass the ✓ ids you haven't
sent yet to `fermi-verifier`, in chunks of **up to 5**, one agent each, **up to 4 at a time**. Don't hold
back a smaller chunk waiting for more drafts.

> Batch `$B`. Check and ingest these drafts: `$B/drafts/<id>.json`, … (their `.check.json` files are next
> to them, with the page text around each quote).

✗ drafts are dropped. Their check files say why, which is useful for tuning the generator later.

Stop once N have been added or the drafts run out. If you're short, run **one** more round of steps
1–3 for the remainder, then stop.

## 4. Report

One line, from the agents' counts and `pnpm q stats` (it prints counts only), starting with `+<n> added`. For
example:

`+5 added (geography 2, food 1, space 2) · 2 failed checks · 1 rejected · pool: 61 active`

## --recheck

1. `pnpm q disputes .fermi-work/recheck.tsv`. This writes IDs and messages only.
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

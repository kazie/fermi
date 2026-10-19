# Fermi: notes for Claude

See README.md for what this is and how to run it.

## Spoilers: the owner plays this game

**Never print question texts or answers** in chat, summaries or commands whose output lands in the main
conversation. That covers `pnpm q get`, `pnpm q export`, `pnpm q list --texts`, `pnpm q quote`, reading the question
JSON in `.fermi-work/`, and querying the `questions` table. Do content work (generating, verifying,
debugging a specific question) inside subagents, and report counts, IDs and categories only. Test
fixtures in `apps/server/test` and `apps/client/src/fixtures` are fake and fine to read.

## Conventions

- pnpm 12 workspace (`pnpm q …`, not `pnpm -s`). The server runs `.ts` directly with Node type
  stripping, so use erasable TypeScript only (no enums or parameter properties) and `.ts` extensions in
  relative imports.
- The calculator, scoring and protocol live in `packages/shared` and are used by both client and server. The
  server re-evaluates sheets; never trust a client-computed value.
- Client views are pure: props in, events out, with time passed as a `now` prop so stories can scrub it.
  Every component gets a `*.story.vue` with phone and desktop in mind. The page must never scroll
  horizontally at 360px.
- Question rules: `content/QUESTION_RULES.md`. FerMEANie's voice: `content/FERMEANIE.md`. Never use
  the word "troll"; wildly-off players get a dunce cap.
- Prettier runs with `semi: false`, so keep Vue inline handlers to a single expression. A
  multi-statement handler loses its `;` and stops compiling; move it into a function.
- Tests: `pnpm test` (vitest projects), `pnpm test:e2e` (Playwright, with `FERMI_TIME_SCALE` speeding up
  reveals), `pnpm type-check`; `pnpm check` runs what CI runs (minus e2e).

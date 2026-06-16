# FWL Working Rules for Claude (and any AI coding assistant)

## Read first
1. Read `docs/ai-handover/` end-to-end before touching any file.
2. Read `docs/05-engine-map.md`, `docs/06-ui-map.md`, `docs/DASHBOARD_DATA_CONTRACT.md` for deeper context.
3. Read `FWL_ENGINE_CONTRACTS.md` before working on any metric.

## Repo navigation
- Never scan the entire repo. The repo is large (40+ pages, dozens of engine files, ~50 sprint docs at root).
- Use `glob` / `grep` with narrow patterns. Start in `client/src/lib/canonical*.ts` for math, `client/src/pages/` for UI.
- Before editing, list the exact files you will touch. Confirm against the user if more than 5.

## Before changing financial logic
1. Write the contract first — add or update the entry in `FWL_ENGINE_CONTRACTS.md` (metric name, selector, file, formula, UI consumers, failure modes).
2. Open the change as a PR only after the contract is committed.
3. Never invent a formula. If unclear, ask the user.

## Preserve tests
- Every `npm run test:*` script in `package.json` is load-bearing. Do not delete or rewrite them.
- If you add code, add a corresponding tsx test under `script/test-*.ts` or `client/src/lib/__tests__/`.

## Quality gates before merge
1. `npm run check` — TypeScript compile.
2. Relevant `npm run test:*` (e.g. `test:canonical-recommendation`, `test:dashboard-contract`, `test:projection-consistency`).
3. `npm run test:all` for cross-cutting changes (it's long; budget for it).
4. Vercel preview must build and the affected page must render.

## Preview before merge
- Push to a feature branch. Wait for Vercel preview to build.
- Verify the affected page(s) visually.
- Only then mark PR ready.

## Never invent financial formulas
- All maths must trace to a file in `client/src/lib/canonical*.ts` or a documented engine.
- If a number on screen has no traceable selector, treat it as a defect and stop until contract is written.

## Every UI metric must cite its selector
- New components: reference the selector by name in a comment above the JSX (`// uses selectCanonicalNetWorth → canonicalNetWorth.ts`).
- Audit Mode must trace every visible metric. If it doesn't, the metric isn't done.

## No duplicate state, no duplicate calculations
- One canonical selector per metric. No local `useMemo` recompute that re-derives net worth, FIRE number, debt service, etc.
- No "helper" function in a component file that duplicates `client/src/lib/canonical*.ts` logic.
- If two selectors return the same field, one of them is wrong — delete it or merge.

## Branching
- Branch off `main`. Name as `sprint<NN>/...` or `fix/fwl<NNN>-...` or `docs/...`.
- Never push to `main` directly. PR + review required.
- Do not unpublish or take down the Vercel deployment.

## Out of scope unless explicitly asked
- Adding new dependencies (`package.json` changes need approval).
- Changing `vercel.json`, `drizzle.config.ts`, `tsconfig.json`.
- Modifying `supabase/migrations/` (new migrations only, never edit shipped ones).
- Touching auth or billing flow (none exists yet — when added, treat as P0 surface).

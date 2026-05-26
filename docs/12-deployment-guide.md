# 12 — Deployment Guide

## Overview

| Stage | Platform | URL / ID |
| ----- | -------- | -------- |
| Production | Vercel | https://familywealthlab.net |
| Database | Supabase | project `uoraduyyxhtzixcsaidg` (ap-southeast-2) |
| Source | GitHub | `rohamshahrokh/shahrokh-family-financial-planner`, branch `main` |

There is **no staging environment**. Vercel preview URLs (one per PR) are the only pre-production check.

## Build pipeline

```bash
npm install
npm run build        # → runs 'vite build' (client) then 'tsx script/build.ts' (server)
NODE_ENV=production node dist/index.cjs
```

The build produces:
- `dist/public/` — client SPA assets
- `dist/index.cjs` — bundled Express handler (loaded by Vercel serverless function)

## Vercel deployment

### Automatic deploy
- Push to `main` → Vercel triggers production build automatically
- Push to any branch → Vercel produces a preview URL

### Manual deploy
```bash
npx -y vercel --token "$VERCEL_TOKEN" --scope rohamshahrokhs-projects --prod
```

### Environment variables (set in Vercel project settings)
- `SUPABASE_URL` — `https://uoraduyyxhtzixcsaidg.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only key (NEVER expose to client)
- `SUPABASE_ANON_KEY` — public anon key
- (any other secrets used by `server/index.ts`)

### Vercel project metadata
- Project: `shahrokh-family-financial-planner`
- Scope: `rohamshahrokhs-projects`
- Framework: detected as Vite + Express

## Database management

### Connecting via Supabase CLI
```bash
supabase login
supabase link --project-ref uoraduyyxhtzixcsaidg
```

### Inspecting schema / running queries
- **Preferred:** Supabase MCP tool from this assistant (`call_external_tool(source_id="supabase", tool_name="execute_sql")`)
- **Alternative:** Supabase Studio web console

### Applying migrations

Migration files live in `supabase/migrations/`. To apply:

```bash
supabase migration up
```

**Pending migration (DO NOT apply automatically):** `2026_05_26_add_goals_set_to_mc_fire_settings.sql` — only after PR #88 is merged.

**Advisory migration (DO NOT apply at all without policy work):** `supabase/migrations-pending/2026_05_26_enable_rls_PENDING_DO_NOT_APPLY.sql` — enabling RLS without policies will block all reads/writes.

### Branch-based migration testing (Supabase)
```
1. Create a Supabase branch: create_branch
2. apply_migration on the branch
3. Smoke the app pointed at the branch
4. merge_branch
```

This is the recommended workflow for the RLS PR (#89).

## Rollback playbook

### Application rollback
1. In GitHub: `git revert <commit>` and push
2. Or: in Vercel dashboard, "Promote" a previous successful deployment to production
3. Vercel keeps deployment history

### Database rollback
- Supabase does NOT auto-revert; for additive columns (like the PR #88 migration), rollback = `ALTER TABLE mc_fire_settings DROP COLUMN goals_set, DROP COLUMN goal_set_timestamp;`
- For destructive changes: restore from Supabase backup (Project Settings → Backups → Point-in-time)

### Specific to PR #88 rollback
1. `git revert` commits in reverse order: `748038c`, `3f85e06`, `6c097c7`, `5e59454`, `05e6d8d`, `48d739b`, `b334e5d`, `3f55192`, `6db5d84`, `3557741`, `2bfdcce`
2. Schema migration NOT applied → no DB rollback required
3. PR #87 untouched → independently revertible

## Local development

```bash
git clone https://github.com/rohamshahrokh/shahrokh-family-financial-planner.git
cd shahrokh-family-financial-planner
npm install
# Set local .env with SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev
# → http://localhost:5000
```

**Login (local + production):** `Roham` / `YaraJana2025`

## Testing

| Suite | Command | Notes |
| ----- | ------- | ----- |
| Typecheck | `npm run check` | Baseline 66 errors — every PR must end ≤66 |
| Sprint 10 | `npm run test:sprint-10` | 846 assertions |
| Sprint 12 | `npm run test:sprint-5-phase4-cfo-advisor` etc. | 47 assertions in `test-sprint12-goal-solver-view` |
| Specific subsystems | `npm run test:monte-carlo-canonical`, `test:tax-rules-engine`, etc. | See `package.json` for full list (~80 test scripts) |
| All | `npm run test:all` | Slow — runs every suite |

## CI

GitHub Actions are configured (see `.github/workflows/` if present) but Vercel's own build pipeline acts as the de-facto CI for build pass/fail.

## Credentials reference

| Service | Where stored | How to use |
| ------- | ------------ | ---------- |
| GitHub | `gh` CLI / GitHub App token | `gh` commands with `api_credentials=["github"]` (for AI assistant); `git` directly for humans |
| Vercel | `$VERCEL_TOKEN` env var | `npx vercel --token "$VERCEL_TOKEN" --scope rohamshahrokhs-projects` |
| Supabase | MCP connector OR `supabase login` | Via assistant: `call_external_tool(source_id="supabase", ...)` |
| App login | hardcoded `Roham` / `YaraJana2025` | Manual browser login |

## Common operations

| Operation | Command |
| --------- | ------- |
| Open a PR | `gh pr create --base main --head <branch> --title "..." --body-file <file> [--draft]` |
| List open PRs | `gh pr list --state open` |
| Inspect main HEAD | `git log --oneline origin/main \| head -5` |
| Query Supabase | (via MCP) `execute_sql` tool |
| Take a Vercel preview | push branch → preview URL appears on PR |

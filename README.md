# Shahrokh Family Financial Planner

A production-ready private wealth dashboard for the Shahrokh family. Built as a premium family office financial planning platform.

## Features

- **Secure Login** — Username: `Roham` / Password: `YaraJana2025`
- **Net Worth Dashboard** — Full snapshot with KPI cards and 10-year projection table
- **Expense Tracker** — Add, edit, delete, import/export Excel expenses with category analysis
- **Property Planner** — PPOR + investment property modelling with cash flow projections
- **Stock Portfolio** — 9 default holdings (NVDA, GOOGL, MSFT, etc.) with DCA planning
- **Crypto Portfolio** — BTC, ETH and more with compounding projections
- **Reports** — One-click Excel workbook + premium PDF wealth report
- **Settings** — Theme, assumptions, backup/restore
- **Dark/Light Mode** — Toggle in sidebar or topbar
- **Data Persistence** — SQLite backend, all data survives refresh/restart

## Default Financial Snapshot

| Item | Value |
|------|-------|
| PPOR | $1,510,000 |
| Cash | $220,000 |
| Super | $85,000 |
| Cars | $65,000 |
| Iran Property | $150,000 |
| **Total Assets** | **$2,030,000** |
| Mortgage | $1,200,000 |
| Other Debts | $19,000 |
| **Total Liabilities** | **$1,219,000** |
| **Net Worth** | **$811,000** |
| Monthly Income | $22,000 |
| Monthly Expenses | $14,540 |
| Monthly Surplus | $7,460 |

## Tech Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **State:** Zustand
- **Backend:** Express.js + SQLite (better-sqlite3 + Drizzle ORM)
- **Build:** Vite 7
- **Exports:** xlsx + jsPDF

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5000

## Production Build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Vercel Deployment

This is a fullstack Node.js app. For Vercel:

1. Create a `vercel.json` in the project root:
```json
{
  "version": 2,
  "builds": [
    { "src": "dist/index.cjs", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "dist/index.cjs" },
    { "src": "/(.*)", "dest": "dist/index.cjs" }
  ]
}
```

2. Run `npm run build` first
3. Deploy with `vercel deploy`

Note: SQLite database will reset on Vercel (ephemeral filesystem). For persistent data on Vercel, replace SQLite with a cloud PostgreSQL (Supabase, Neon, etc.) by updating `server/storage.ts`.

## Supabase Integration

To add Supabase:
1. Create a project at supabase.com
2. Copy the SQL from `server/storage.ts` (the `sqlite.exec` migration) and run it in Supabase SQL Editor
3. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env`
4. Replace the SQLite client in `server/storage.ts` with the Supabase JS client

## Family Members

- Roham Shahrokh (primary account holder)
- Fara Ghiyasi (co-account holder)
- Yara Shahrokh (beneficiary)
- Jana Shahrokh (beneficiary)

## Location

Brisbane, Queensland, Australia · AUD

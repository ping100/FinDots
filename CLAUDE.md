# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

**Dots** — two apps sharing one Supabase account: **Findots** (`/money`, finances
tracked by dragging icon "bubbles" between blocks — no manual entry) and
**Todots** (`/tasks`, day-based task list with drag-to-reschedule). `/` is the
switcher between them; each app's header links to the other.

Stack: Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · dnd-kit ·
Supabase (Postgres + Auth, RLS) · Vercel. Live at https://dotsapp.vercel.app
(Vercel project `dotsapp`, Supabase project `yssdpeqzvauxwhuktyvz`, repo
`ping100/FinDots`).

## Commands

```bash
npm run dev         # next dev (runs icon generation first)
npm run build        # production build (also copies pdf.worker.min.mjs)
npm run start        # serve a production build
npm run typecheck    # tsc --noEmit
```

There is no test suite or lint script configured in this repo. Always run
`npm run typecheck` after changes, and `npm run build` before considering
UI/data-flow changes done — Turbopack's build step catches issues `tsc` alone
misses.

Supabase migrations live in `supabase/migrations/`, applied in filename order
(the timestamp prefix is how Supabase tracks what's applied — never rename or
reorder existing files; a new migration gets a new timestamped filename).

## Architecture

### Two apps, one account, separate data providers

Each app has its own `DataProvider` (`src/components/DataProvider.tsx` for
money, `src/components/tasks/DataProvider.tsx` for tasks) exposing a
`useStore()` context: it loads all of that app's Supabase rows once, exposes
them plus derived values, and every mutation method does an optimistic local
update alongside the Supabase write. `src/app/money/layout.tsx` and
`src/app/tasks/layout.tsx` each wrap their route subtree in
`<DataProvider><Shell>{children}</Shell></DataProvider>` — nothing is shared
between the two providers except the Supabase auth session and the `profiles`
row (display name, theme, text scale are common; money fields like
`base_currency` live on the same row but tasks ignores them).

### Money data model: transactions + views, no stored balances

`src/lib/types.ts` defines the shapes. Wallet balances and unallocated income
are never stored — they're computed by Postgres views in
`supabase/migrations/20260922141027_0001_init.sql`:

- `wallet_balances` sums signed transaction deltas per wallet from
  `transactions.initial_balance` onward. Sign is `-1` for `debt_out` wallets
  (money flowing in reduces what you owe) and `+1` for everything else,
  including `debt_in` (money flowing in increases what's owed to you).
- `income_pools` is `sum(income) - sum(allocations)` per category, and only
  includes rows where the remainder is `> 0` — a fully-allocated income
  category disappears from this view entirely. `poolOf(categoryId)` in the
  store wraps this with a zero-fallback.

Because balances are derived, editing or deleting any transaction
automatically corrects every downstream total — never hand-maintain a
balance field.

`TxType` is `income | allocation | expense | transfer | adjustment`:
`income` credits a category (not yet in any wallet), `allocation` moves part
of a pooled income into a wallet, `transfer` moves money wallet-to-wallet
(including debt repayment/lending, via `addTransfer`), `adjustment` is a
manual balance correction. Deleting a wallet or category archives it
(`archived: true`) rather than removing rows, so history stays intact.

### Shared UI primitives

`src/components/AmountSheet.tsx` is the numeric-keypad amount entry used
throughout the money app (income, allocation, expense, transfers, debt
payments). Its `max` prop caps entry and disables submit above it — passing
`max={0}` makes the sheet effectively unusable, which is a common source of
"nothing happens" bugs when a wallet's balance is legitimately zero.
`src/components/WalletEditor.tsx` is the single editor for every wallet kind
(cash/card/savings/debt_out/debt_in); which fields show depends on `kind`.

Drag-and-drop (allocating income to a wallet, moving a wallet to an expense
category, rescheduling a task to another day) uses `@dnd-kit/core`'s
`useDraggable`/`useDroppable`, with payload/target shapes defined per app in
`DragPayload`/`DropTarget` types (`src/lib/types.ts` for money,
`src/lib/tasks/types.ts` for tasks).

### Auth gating

`src/proxy.ts` (Next middleware) redirects unauthenticated requests to
`/login` for every route except `PUBLIC_PATHS`. When testing routes without
a real session (e.g. against a mocked Supabase backend), that list is the
only thing standing between a route and a login redirect — restore it after.

### Admin section

`src/app/admin/` is a separate, RLS-gated view over aggregate usage data
(user counts, Supabase storage/DB size vs. free-tier limits, support
threads) — see `src/lib/admin.ts` and `src/lib/useIsAdmin.ts`. It reads its
own data, not the money/tasks `DataProvider`s.

### Multi-currency

Users manually set exchange rates (`exchange_rates` table, `rate_to_base`).
`toBase()`/`convert()` (`src/lib/money.ts`, mirrored in SQL as
`convert_amount()`) convert between currencies through the user's base
currency — there's no external rate feed.

## Environment / secrets

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from
  Supabase Project Settings → API.
- OpenRouter: no shared app key — each user supplies their own in Settings,
  stored server-side in the `ai_keys` table (RLS-protected, full value never
  sent to the browser — only `ai_key_status` with the last 4 chars). Only
  the `/api/analyze` route reads the full key. `AI_DAILY_LIMIT` caps calls
  per user per day.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — optional Cloudflare Turnstile captcha
  on signup; blank means captcha is off.
- Build identity: `next.config.ts` stamps `NEXT_PUBLIC_BUILD` from
  `VERCEL_GIT_COMMIT_SHA` (or a build timestamp locally); `/api/version`
  exposes it so the client can detect and prompt for a redeploy.

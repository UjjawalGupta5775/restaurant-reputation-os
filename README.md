# Reputation OS

QR-based feedback funnel for any local business. Customers scan a QR, rate their visit, and choose between leaving a Google review (with assistance — never auto-submitted) or sending private feedback to the owner. Owners get a dashboard with rating funnel, daily scan volume, and a private feedback inbox.

**Hard product rules:**
- The platform never auto-submits reviews to Google. The customer controls submission and can edit suggested text.
- Both actions — "Leave Google Review" and "Send Private Feedback" — are always visible regardless of rating.
- No incentives conditioned on positive sentiment.

## Stack

- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript
- Tailwind v4 · shadcn/ui (base-nova preset, neutral base)
- Supabase: Postgres + RLS + Auth + Storage
- Deployed on Vercel

## Local development

```bash
cp .env.local.example .env.local
# fill in Supabase URL, anon key, service role key
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database

Migrations live in `supabase/migrations/`. Apply them in order against your Supabase project (SQL editor or `supabase db push`).

```
0001_init.sql              — base schema (businesses, campaigns, feedback, analytics)
0002a_rbac_schema.sql      — app_users + business_members
0002b_rbac_backfill.sql    — backfill from existing owner_user_id rows
0003_rls_swap.sql          — swap RLS policies to RBAC
0004_drop_owner_user_id.sql — drop legacy column
```

## Environment variables

| Variable | Used by | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only (`lib/supabase/admin.ts`) | ✓ |
| `NEXT_PUBLIC_APP_URL` | invite redirect URLs | ✓ |
| `POSTGRES_URL` | local verification scripts only | dev-only |

## Deployment (Vercel)

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Set the four required env vars above (Vercel → Project → Settings → Environment Variables).
4. Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://your-app.vercel.app`).
5. Vercel auto-builds on every push to `master`.

## Authentication model (Phase 4A RBAC)

- **Super-admin** seats business owners via invite-only email flow. No public self-signup.
- **Owners** see only their own business via RLS (`has_business_access` helper).
- **Anonymous customers** can insert into `feedback_submissions` and `analytics_events` (firehose); cannot read anything.

Architectural detail in `PROJECT_CONTEXT.md` (parent directory).

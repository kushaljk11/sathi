# Sathi

**Interactive Youth Wellbeing, Early Support & Service Coordination Platform** — *From finding support to staying supported.*

Sathi helps young people reflect on their wellbeing, find suitable counselors and programs, book and attend sessions
(including Google Meet), and stay supported through collaborative plans, tasks and progress tracking.
**Sathi is not a diagnostic tool, an emergency service, or a replacement for qualified professionals.**

## Stack
React 19 · Vite · Tailwind v4 · TanStack Query · Recharts · Socket.IO — Express 5 · Prisma 6 · PostgreSQL · Zod ·
JWT + Argon2id — BullMQ/Redis worker · Nodemailer · FCM (optional) — eSewa & Khalti · Google Calendar/Meet.

```
backend/api       REST API /api/v1 (+ Socket.IO chat, OpenAPI at /api/v1/openapi.json)
frontend       React SPA with role-specific dashboards (youth, counselor, organization, admin)
backend/worker    BullMQ worker (emails, push, reminders, meeting creation, sweeps, DLQ)
shared  Domain logic: matching, moderation, refunds, consent, state machines, schemas
backend/prisma/     Schema, migrations, synthetic seed
docs/          architecture, algorithms, security, deployment, testing, status, policies/
e2e/           Playwright end-to-end tests
```

## Quick start (local)
Requirements: Node 20+ (tested on 24), PostgreSQL 14+ (tested 18), Redis 7 optional in development.

```bash
npm install
# If npm ≥11 blocks install scripts:
npm install-scripts approve prisma @prisma/client @prisma/engines argon2 esbuild msgpackr-extract && npm rebuild

cp .env.example .env          # then edit secrets / DATABASE_URL
# Option A: project-local Postgres on :5434 (uses your installed PostgreSQL binaries)
bash scripts/dev-db.sh start
# Option B: docker compose up -d   (Postgres on :5433, Redis on :6379 — adjust DATABASE_URL)

npx prisma migrate deploy
npm run db:seed
npm run dev:api        # http://localhost:4000/api/v1/health
npm run dev:web        # http://localhost:5173
npm run dev:worker     # needs Redis; without it the API uses clearly-labelled DEV adapters
```

Environment variables already set in your shell take precedence over `.env` (e.g.
`DATABASE_URL=postgresql://sathi@localhost:5434/sathi npm run dev:api`).

## Development accounts (synthetic seed data only)
All seeded accounts use the password **`Sathi@Dev2026`** (override with `SEED_PASSWORD`). Never seed production.

| Role | Email |
|---|---|
| Admin | admin@sathi.dev |
| Youth (has an active support journey) | youth1@sathi.dev |
| Youth (pending paid booking request, program booking) | youth2@sathi.dev |
| Youth (proposed plan, online session needing meeting setup) | youth3@sathi.dev |
| Youth (moderated content, on a waitlist) | youth4@sathi.dev — also youth5, youth6 |
| Counselor (pending verification) | counselor4@sathi.dev |
| Organization (pending verification) | org3@sathi.dev |
| Counselors (verified) | counselor1@sathi.dev · counselor2@sathi.dev · counselor3@sathi.dev |
| Organizations (verified) | org1@sathi.dev · org2@sathi.dev |

## Tests
```bash
npm test -w @sathi/shared                 # unit: matching, moderation (EN/NE), refunds, consent, states, progress
npm test -w @sathi/api                    # integration against real Postgres (database sathi_it on :5434 by default;
                                          # override TEST_DATABASE_URL). Uses only `prisma migrate deploy`.
npx playwright test                       # end-to-end (see docs/testing.md)
npm run typecheck && npm run build
```

## Integrations without credentials
| Integration | Without credentials |
|---|---|
| eSewa | Works against the public UAT sandbox (`EPAYTEST`) |
| Khalti | Disabled (UI says "not configured") until `KHALTI_SECRET_KEY` is set |
| Google Meet | Counselors see "not configured"; **no fake links**. Dev-only manual link option (never in production) |
| Email | Logged by the DEV EMAIL ADAPTER |
| Redis | API logs DEV QUEUE ADAPTER warnings; holds/expiry sweeps run in-process in development |
| FCM | Push skipped (logged) |

## Troubleshooting
- `Invalid environment configuration` → a required variable is missing; JWT secrets must be ≥32 chars.
- `P1000 authentication failed` → fix `DATABASE_URL` (or use `scripts/dev-db.sh`).
- Prisma refuses `migrate reset` when run by an AI agent — intentional; use `migrate deploy` on a fresh DB.
- Port 5173/4000 busy → stop the other process or change `PORT`/Vite port and `FRONTEND_URL`.
- Payments return to `invalid` → callback signature failed; check `ESEWA_SECRET_KEY` matches the merchant.

Docs: [architecture](docs/architecture.md) · [algorithms](docs/algorithms.md) · [security](docs/security.md) ·
[deployment](docs/deployment.md) · [testing](docs/testing.md) · [status](docs/status.md) · [policies](docs/policies/README.md)

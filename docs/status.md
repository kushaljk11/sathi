# Implementation status

| Feature | Status | Tested | Remaining work |
|---|---|---|---|
| Monorepo, TS, Tailwind, ESLint/Prettier, env validation | Done | Typecheck + build | — |
| Prisma schema (all domains in spec §29) | Done | `prisma validate` | Run first migration against your DB |
| Seed data (synthetic) | Written | Not yet run (needs DB password) | Run `npm run db:seed` |
| Auth: register, login, logout, verify email, forgot/reset/change password, refresh rotation + reuse detection, RBAC | Implemented | Typecheck only | Supertest integration tests (need test DB) |
| Wellbeing check-in wizard (append-only) + trend chart (7d/30d/3m) | Implemented | Typecheck/build | Custom date range UI, reminders |
| Matching engine (hard filter + weighted scoring + explanations) | Implemented | 5 unit tests | Comparison view |
| Matching runs persisted + admin versioned weights | Implemented | Typecheck | Integration test |
| Refund policy, booking state machine, consent evaluation, capacity, task rate | Implemented (pure logic) | 11 unit tests | Wire into API modules |
| Notification worker (BullMQ + SMTP/dev adapter) | Implemented | Not run (no Redis) | FCM, quiet hours, scheduled reminders |
| Assessment wizard / Support Need Profile API | Schema only | — | Routes + UI |
| Safety pathway | Static page + schema | — | Configurable rules, resource admin |
| Slot holds, booking, eSewa/Khalti sandbox, refunds | Schema + logic | Logic tested | API routes, gateway adapters |
| Support relationships, plans, goals, tasks, reviews | Schema only | — | API + UI |
| Organizations, programs, waitlist, recommendations | Schema + seed | — | API + UI |
| Admin verification, users, analytics | Schema only | — | API + UI |
| Chat, community, resources | Schema only | — | API + UI |
| Playwright E2E, OpenAPI docs | Not started | — | — |

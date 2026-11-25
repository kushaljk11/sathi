# Deployment & operations guide

> Sathi must not be described as "production ready" until every item in **Launch checklist** is complete.

## 1. Topology
- **web**: static build (`npm run build -w @sathi/web` → `frontend/dist`) served by a CDN or Nginx.
- **api**: `node`/`tsx` process(es) behind a TLS-terminating reverse proxy (set `TRUST_PROXY=1`). Sticky sessions
  (or the Socket.IO Redis adapter) are required if you run more than one API instance.
- **worker**: one or more `npm run start -w @sathi/worker` processes.
- **PostgreSQL 16+**, **Redis 7+** (with persistence).

Serve web and API from the same site (e.g. `app.example.org` and `app.example.org/api`) so the SameSite=Strict
refresh cookie works. Set `FRONTEND_URL`, `BACKEND_URL` (https) accordingly.

## 2. Production environment
Copy `.env.example`; in production:
- `NODE_ENV=production`, strong random `JWT_*` secrets, `ENCRYPTION_KEY` (32-byte base64; **back it up** — losing it
  invalidates stored Google connections), https `BACKEND_URL` (startup fails otherwise).
- `ALLOW_DEV_MANUAL_MEETINGS` is ignored in production (always off).
- Never commit `.env`. Use the platform's secret manager.

## 3. Database
```bash
npx prisma migrate deploy        # apply migrations (never `migrate dev` in production)
npm run db:seed                  # ONLY for development/demo; never seed production with demo accounts
```
**Backups**: daily `pg_dump -Fc` + continuous WAL archiving (PITR) or managed-provider automated backups;
retain 30 days; encrypt at rest; test restores monthly (`pg_restore -d sathi_restore backup.dump`).

## 4. Redis
Enable AOF persistence (`appendonly yes`, `appendfsync everysec`) so delayed jobs (reminders, follow-ups) survive
restarts. Set `maxmemory-policy noeviction` (required by BullMQ). Protect with a password/TLS (`rediss://`).
Failed jobs that exhaust retries are copied to the `notifications-dlq` queue and visible in Admin → Background jobs.

## 5. Logging, monitoring, health
- `GET /api/v1/health/live` (liveness), `GET /api/v1/health` (readiness: DB + integration flags).
- API logs to stdout (never logs request bodies, tokens or wellbeing data). Ship stdout to your log platform.
- Add error monitoring (e.g. Sentry) in `errorHandler` and the worker `failed` handler — not yet wired.
- Alert on: readiness failures, DLQ growth, payment reconciliation failures, safety-escalation notifications.

## 6. HTTPS & domain
- Obtain TLS certs (Let's Encrypt/managed). Redirect HTTP→HTTPS. HSTS is enabled by the API in production.
- DNS: `A/AAAA` (or CNAME) for the app domain; configure SPF/DKIM/DMARC for the email domain.

## 7. Email (Nodemailer SMTP)
Set `EMAIL_HOST/PORT/USER/PASSWORD/FROM` to a transactional provider (SES, Postmark, Mailgun…). Without
`EMAIL_HOST` the worker uses a clearly labelled console adapter (development only).

## 8. Payment merchants
- **eSewa ePay v2**: sandbox works with the public UAT values in `.env.example` (`EPAYTEST`). For production obtain
  merchant code + secret from eSewa, set `ESEWA_BASE_URL=https://epay.esewa.com.np`. Return URLs are
  `BACKEND_URL/api/v1/payments/esewa/return/{reference}` and `/failed/{reference}`.
- **Khalti ePayment v2**: create a merchant at test-admin.khalti.com for sandbox (`KHALTI_BASE_URL=https://dev.khalti.com/api/v2`)
  and khalti.com for live (`https://khalti.com/api/v2`). Return URL: `BACKEND_URL/api/v1/payments/khalti/return/{reference}`.
- **Refunds**: neither checkout API exposes a public refund endpoint used here; refunds are executed in the merchant
  portal, then an admin records completion with the gateway reference (Admin → Payments & refunds).
- Run a full sandbox transaction for each provider before launch (not performed in this repository's automated
  tests, which mock gateway HTTP responses).

## 9. Google OAuth / Meet
1. Google Cloud Console → create project → enable **Google Calendar API**.
2. OAuth consent screen (External), add scope `https://www.googleapis.com/auth/calendar.events`; this is a sensitive
   scope → **Google verification is required** before public use (test users only until verified).
3. Create OAuth client (Web): authorised redirect URI `BACKEND_URL/api/v1/meetings/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ENCRYPTION_KEY`.
5. Counselors connect via Counselor → Google Meet. Events are created on the counselor's primary calendar with a
   Meet conference, private visibility, no attendees (emails not shared), no recording/transcription.
Note: automated tests mock the Google provider; a live end-to-end Google test requires real credentials.

## 10. FCM push (optional)
Create a Firebase project → service account with Firebase Messaging → set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`,
`FCM_PRIVATE_KEY`. The web client registration of FCM tokens (service worker) is **not yet implemented**; the
server sends via FCM HTTP v1 when a token is stored in notification preferences.

## 11. File storage
The local driver writes to `UPLOAD_DIR` (outside the web root). For production implement the `StorageDriver`
interface (`backend/api/src/integrations/storage/storage.service.ts`) with an S3-compatible private bucket and add AV scanning (ClamAV) before `put`.

## 12. Launch checklist (external dependencies)
- [ ] Clinical/professional review of assessment questions, safety questions & rules, safety resources (with real, verified local emergency numbers), and moderation lexicons.
- [ ] Legal review: privacy policy, terms, consent wording, minors' consent/age policy, data retention.
- [ ] eSewa and Khalti merchant accounts + live credential verification; sandbox E2E transaction each.
- [ ] Google OAuth app verification for `calendar.events`.
- [ ] SMTP provider + domain authentication; FCM project (optional).
- [ ] Managed Postgres with PITR backups; Redis with AOF; restore drill.
- [ ] TLS, domain, CDN; error monitoring; log retention configuration.
- [ ] Independent security test; AV scanning; S3 storage driver; admin MFA.
- [ ] Trained moderators and a documented on-call safety review rota.

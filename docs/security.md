# Security & privacy review

Status reflects what is implemented **and verified by automated tests** in this repository. It is a self-review,
not an independent penetration test or legal/clinical compliance assessment.

| Control | Implementation | Verified |
|---|---|---|
| Password hashing | Argon2id (`argon2` defaults) | test asserts `$argon2id$` |
| Access tokens | JWT, 15 min, memory-only on client | auth tests |
| Refresh tokens | random 384-bit, SHA-256 hashed at rest, HttpOnly + SameSite=Strict + Secure(prod) cookie scoped to `/api/v1/auth`, rotation on every refresh, **reuse detection revokes the whole family** | test |
| Session revocation | logout, password reset, suspension and deletion revoke refresh tokens; suspended users rejected on every request (role & status read from DB) | test |
| CSRF | cookie only used on `/auth/*`; SameSite=Strict + Origin/Referer check on refresh/logout; all other endpoints use bearer tokens | code review |
| RBAC | deny-by-default `requireRole` on every router; ADMIN cannot self-register | test |
| Relationship-based authz | support/chat/meeting endpoints require being the youth or assigned counselor; admins are **not** granted access to relationships or private notes | tests |
| Consent | per-category consent records + history; every sensitive counselor read evaluated by `evaluateConsent` and written to `SensitiveDataAccessLog`; withdrawal stops access immediately | tests |
| Organizations | booking views expose only display name/age group/attendance/feedback; never recommender or wellbeing data | test |
| Input validation | Zod on every body/query; 100 kB JSON limit | — |
| Output encoding | React escaping; no `dangerouslySetInnerHTML`; API never returns stack traces | code review |
| SQL injection | Prisma parameterised queries; one raw query uses tagged template parameters | — |
| Rate limiting | global 300/min/IP; auth 20/15 min; community posting 6/min/user | — |
| Headers | Helmet (CSP default, HSTS in production), `x-powered-by` disabled, CORS allowlist = FRONTEND_URL | — |
| File uploads | 5 MB, memory buffer, **magic-byte sniffing** (PDF/PNG/JPEG only), PDFs with JavaScript/Launch/EmbeddedFile rejected, random storage keys, mode 0600, download only by owner/admin with `nosniff` + attachment | — |
| Malware scanning | **Not implemented.** Production must add ClamAV (or provider AV) scan before storing — see deployment guide | gap |
| OAuth secrets | Google refresh tokens AES-256-GCM encrypted with `ENCRYPTION_KEY`; state parameter hashed, single-use, 10-min expiry; minimum scope `calendar.events` | test (encrypt/decrypt via meeting tests) |
| Payments | browser return never trusted; eSewa callback signature check **and** server-to-server status API; Khalti lookup API; amount check; idempotent settlement (conditional update) | tests (gateway mocked) |
| Double booking | compare-and-set on slot + partial unique index on active appointments; holds unique per slot | concurrency tests |
| Capacity | conditional increment + `CHECK (seatsTaken BETWEEN 0 AND seats)` | concurrency test |
| Audit logging | auth events, verification, approvals, suspensions, settings, refunds, moderation, safety escalations, document views | test |
| Notifications | neutral text only; no wellbeing details in email/push | test |
| Account deletion | anonymises identity, revokes sessions, deletes OAuth credentials; payment/safety records follow retention policy | test |
| Data export | JSON export of own data | test |

## Known gaps / required before public launch
1. Independent security assessment / penetration test.
2. Antivirus scanning for uploads; S3-compatible private bucket driver (local driver only today).
3. Centralised error monitoring (e.g. Sentry) and structured logging shipping — hooks documented, not wired.
4. Legal review (privacy law applicable in Nepal and any other operating region), clinical review of assessment,
   safety questions, safety rules, resources and moderation lexicons.
5. Organization program payments use the same gateway flow but have only been tested for free programs end-to-end.
6. MFA for admin accounts is not implemented.

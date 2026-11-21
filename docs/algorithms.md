# Algorithms

## 1. Explainable matching (`shared/src/matching.ts`)

**Stage 1 — hard filters** (excluded providers are never scored): not verified, suspended, not accepting bookings,
age group not served, delivery mode impossible, no open future slots, none of the user's concerns supported.

**Stage 2 — weighted scoring.** Each factor is normalised to 0–100 and kept in its own pure function:

| Factor | Default weight | Calculation |
|---|---|---|
| Concern | 30 | share of the user's concerns the provider supports |
| Specialization | 20 | share of the user's concerns in provider specializations |
| Language | 15 | 100 if the first-preference language matches, 70 if another matches, 0 otherwise |
| Availability | 15 | minutes of overlap between the user's weekly windows and provider availability ÷ requested minutes |
| Location | 10 | haversine distance vs. user's max travel; online-capable pairs never fall below 80 (distance is not penalised for online) |
| Mode | 10 | 100 exact/BOTH-provider, 70 when user accepts either, 0 impossible |

`final = Σ(weight × factorScore / 100)`, rounded. Weights are admin-configurable, must sum to 100, and every
change creates a new `MatchingConfiguration` version. Each run is persisted (`MatchingRun`,
`ProviderRecommendation`, `MatchingFactorScore`) with the config version used, so results are auditable.
Explanations list factors ≥80; gaps list factors <60. The UI states compatibility ≠ treatment effectiveness.
No travel-time values are invented. Timezone note: weekly windows are stored as local day/minute ranges.

## 2. Community moderation (`shared/src/moderation.ts`, `backend/api/src/modules/community/moderation`)

Layered pipeline executed **before** content becomes visible:

1. **Deterministic spam layer** — duplicate content (normalised SHA-256 within 24 h), posting frequency per hour,
   excessive links, shortened/suspicious links (punycode, IP literals, risky TLDs), advertising phrases,
   repetitive text, express rate limit (6/min per user).
2. **Text classification layer** — provider abstraction:
   - `local-rules-v1` (default, no external dependency): English + Nepali (Devanagari and romanised) lexicons for
     targeted insults (insult **and** second-person/@ target required), harassment, hateful generalisations,
     threats, personal-information exposure (phone, email, address, ID numbers) and self-harm concern.
     Untargeted strong language ("this exam is stupid") and disagreement are **not** bullying.
   - `perspective` adapter (optional, English only) merges Google Perspective scores; failures route to review.
   - Unsupported scripts or borderline scores (0.35–0.5) → human review.
3. **Decision** (configurable thresholds, default hold 0.5 / hide 0.85 / reject 0.9):
   - self-harm ≥ hold → `FLAGGED` + safety escalation; author sees a supportive message with the urgent-help link.
   - threat ≥ hide → `HIDDEN` + safety escalation.
   - spam/malicious link ≥ reject (and the dominant signal) → `REJECTED` (author may edit or appeal).
   - any ≥ hide → `HIDDEN` pending review; any ≥ hold or uncertain → `FLAGGED`; else `APPROVED`.
4. **Human workflow** — moderator queue (review, safety, appeals, spam, bullying, resolved), evidence view without
   identity, actions (approve, remove, restore, warn, restrict posting N days, suspend with mandatory note,
   escalate, dismiss reports, uphold/deny appeal). Every decision is a `ModerationAction` + audit log.
   Reports: N open reports (default 3) or any threat/self-harm report → `FLAGGED`.
   **No automated suspension ever occurs.**
5. **Retention** — original text kept in `ModerationCase.originalText` until `retainUntil` (default 365 days),
   then purged by the daily job; decision metadata is retained.

Tested with synthetic English/Nepali examples including false-positive checks (`shared/test/moderation.test.ts`).
The lexicons are a starting point and **must be reviewed and extended by trained moderators** before launch.

## 3. Refunds (`shared/src/refund.ts`)
>24 h before: 100 %; 2–24 h: 50 %; <2 h: 0 %; counselor cancel/decline: 100 %. Configurable via `refund.policy`.

## 4. Progress "What changed?" (`shared/src/progress.ts`)
Compares period means with the immediately preceding equal-length period. Periods with no data return `null`
(rendered as "not enough data"), never 0. Lower stress counts as improvement. Self-reported data only — no clinical claims.

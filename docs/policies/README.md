# Policy templates

These are **templates**, not legal advice. They must be reviewed by qualified legal counsel and, where relevant,
clinical professionals before Sathi is offered to the public. Replace every `[bracketed]` placeholder.

## Privacy policy (template)
- **Who we are:** [Operator legal name, address, contact email].
- **What we collect:** account data (name, email); profile preferences; self-reported check-ins and assessments;
  appointments, payments (no card data — handled by eSewa/Khalti); messages with your counselor; community posts.
- **Why:** to match you with support, run appointments, keep your support plan, keep the community safe.
- **Sharing:** counselors only receive the categories you switch on (assessment summary, support need profile,
  check-in trends, support history) and you can withdraw at any time. Organizations only receive what is needed
  to manage a booking. Administrators do not access private counseling notes. We never sell data.
- **Processors:** hosting [provider], email [provider], payments (eSewa, Khalti), Google (meeting links, if your
  counselor uses Google Meet), [error monitoring].
- **Your rights:** access/export (Privacy center → Download my data), correction, deletion (Privacy center → Delete
  account), withdraw consent, complain to [authority].
- **Retention:** see Data retention policy.
- **Children & young people:** [minimum age, guardian consent rules per applicable law].
- **Not an emergency service:** Sathi cannot contact emergency services for you.

## Terms of service (template)
Eligibility [age]; acceptable use (community guidelines apply); counselors are independent verified professionals
[or employment relationship]; Sathi does not diagnose or provide treatment; payments and refund policy
(>24 h full, 2–24 h 50 %, <2 h none, counselor cancellation full); account suspension for violations after human
review; limitation of liability [counsel to draft]; governing law [jurisdiction].

## Community guidelines
Be kind. Disagree with ideas, not people. No bullying, harassment, hate, threats, sexual content, advertising or
link spam. Do not share anyone's personal information (including your own phone/address). Peer support is not
professional advice. If you are in danger, use the Urgent help page. Posts are checked before they appear; you can
edit or appeal decisions. Repeated violations may lead to posting restrictions, and serious ones to suspension after
human review.

## Moderation policy
Automated checks only ever **approve, hold, hide or reject** content; account suspension is always a human decision
with a recorded note. Safety-related content (threats, self-harm concern) is prioritised for review within
[target time] by [trained staff]; moderators follow the [escalation procedure] and never promise emergency response.
Moderators see pseudonyms and moderation history, not real identities or wellbeing records. Every decision is logged.
Appeals are reviewed by a different moderator where possible within [N days].

## Data retention policy (defaults in code; adjust after legal review)
| Data | Retention |
|---|---|
| Account & profile | until deletion; anonymised on deletion |
| Check-ins, assessments, plans | life of account; [N years] if required by professional record-keeping rules |
| Private counselor notes | per professional regulations [N years]; not exportable by admins |
| Payment records | [N years] per tax/accounting law |
| Moderation evidence (original text) | `moderation.retentionDays` (default 365), then purged; decisions kept |
| Audit logs / sensitive-access logs | [N years] |
| Chat messages | life of relationship + [N months]; closed relationships are read-only |

## User support procedure
1. Support inbox `platform.supportEmail` (Admin → Platform settings); acknowledge within [1 business day].
2. Triage: account/access · payments/refunds · counselor/organization conduct · privacy request · safety concern.
3. Safety concerns: never handled as ordinary tickets — follow the safety escalation procedure immediately and share
   emergency information; do not promise outcomes Sathi cannot deliver.
4. Payments: check Admin → Payments; reconcile; process refunds in the merchant portal; record gateway reference.
5. Privacy requests: verify identity; use in-app export/deletion; record in audit log.
6. Close with a summary; record recurring issues for product review.

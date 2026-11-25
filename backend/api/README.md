# @sathi/api

Express 5 + Prisma + Zod REST API (`/api/v1`), Socket.IO chat, and the job processors used by `backend/worker`.

```bash
npm run dev:api          # from the repo root; http://localhost:4000/api/v1/health
npm run typecheck -w @sathi/api
npm test -w @sathi/api   # integration tests against a real Postgres (see root README)
```

## Folder structure

```
src/
├── config/          env.ts (validated env), database.ts (Prisma client), cors.ts, openapi.ts
├── core/
│   ├── middleware/  auth, error, validation, origin (CSRF), rate-limit, request-logger
│   ├── errors/      AppError + error codes
│   └── logger/      leveled logger (JSON lines in production)
├── modules/         one folder per feature (see below)
├── integrations/    external services: esewa, khalti, google-calendar, email, push (FCM), storage
├── utils/           pure, reusable functions (hash, jwt, date, pagination, response, async-handler)
├── helpers/         reusable feature-supporting functions that touch the DB/queue (audit, notify, identity, settings, email, file)
├── constants/       app, roles, messages, platform-setting defaults
├── types/           express.d.ts (req.user), common + API envelope types
├── queues/          BullMQ queue + `enqueue` (with a DEV adapter when Redis is down)
├── jobs/            background job processors (shared by the worker and by tests)
├── sockets/         Socket.IO (JWT handshake, chat rooms)
├── routes.ts        mounts every module under /api/v1
├── app.ts           Express app (security middleware, routes, error handling)
└── server.ts        HTTP server, sockets, graceful shutdown
```

Prisma lives one level up in `backend/prisma/` (schema, migrations, seeds); the background worker in `backend/worker/`.

## Inside every module

```
<name>/
├── <name>.routes.ts       Router wiring only: middleware order, validation, role guards
├── <name>.controller.ts   HTTP layer: read req → call service → ok(res, data)
├── <name>.service.ts      Business logic and Prisma access. No Express types.
├── <name>.validation.ts   Zod schemas
├── <name>.types.ts        `z.infer` input types and module interfaces
└── <name>.constants.ts    (only when the module has constants)
```

Rules:

- **Routes** declare `router.<verb>(path, ...guards, validate({ body | query | params }), controller.handler)`.
- **Controllers** are `asyncHandler(async (req, res) => ...)`; they cast already-validated input, e.g. `req.body as CreateThingInput`.
- **Services** throw `AppError(status, message, code?)` (or `notFound()`/`forbidden()`); the error middleware formats it.
- Responses are always `{ success: true, data }` or `{ success: false, error: { code, message } }`.
- A module may import another module's **service** or **constants** (never its controller/routes).
- Shared code goes in `utils/` (pure) or `helpers/` (DB/queue). Third-party APIs go in `integrations/`.

## Adding a feature

1. Create `src/modules/<name>/` with the files above.
2. Mount `<name>.routes.ts` in `src/routes.ts`.
3. Add the endpoints to `src/config/openapi.ts`.
4. Add an integration test in `test/`.

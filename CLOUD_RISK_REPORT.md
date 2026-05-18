# Cloud Risk Report

## Cal POS Reference Stack

Cal POS uses:

- Frontend: React, TypeScript, Vite, Dexie/IndexedDB, Zustand
- Local database: IndexedDB via Dexie
- Backend: Fastify
- Database: PostgreSQL via Prisma
- Auth: JWT + refresh token
- Realtime: WebSocket with fallback polling
- Storage: Supabase Storage for backups
- Deployment: Vercel frontend, Render backend, Supabase DB/Storage
- Sync: queue -> push -> pull -> apply -> WebSocket notify

## Current App Cloud Status

This app now has:

- Local-first UI still backed by localStorage
- Cloud metadata and queue sidecar
- Manual Cloud Status UI
- Backend scaffold with Fastify, Prisma, JWT, generic sync records, WebSocket route, attachment metadata
- Manual push and manual pull/apply in frontend
- Render/Vercel config
- Root scripts for backend build and Prisma generate

## Still Not Equal To Cal POS

1. Data layer is still localStorage, not Dexie.
2. Pull/apply is manual, not automatic scheduler.
3. Pull/apply writes localStorage then needs app reload for all mounted stores to fully refresh.
4. Attachment file binary upload is not implemented yet, only metadata registration backend exists.
5. Cloud auth UI is not connected to the existing login screen yet.
6. Backend generic JSON sync is flexible but weaker than strict per-entity schema validation.
7. Wallet sync still uses snapshot strategy, which is risky for multi-device writes.
8. WebSocket backend exists, but frontend WebSocket client/scheduler is not connected yet.
9. Refresh token rotation exists, but old refresh tokens are not revoked automatically on refresh yet.

## Highest Risks Before Production

1. Wallet drift if two devices change cash/transfer at the same time.
2. Duplicate or skipped pending payments if users pay the same pending item on two devices.
3. Attachment loss because local file paths are not portable across devices.
4. Security leak if local `passwordPlain` or `pinPlain` ever enters cloud payloads.
5. Permission bypass if backend runs with `ALLOW_DEV_NO_AUTH=true` in production.
6. localStorage queue growth and quota issues under heavy usage.
7. Manual pull conflict skips may leave devices temporarily inconsistent until reconciliation.
8. Full dev dependency install reported vulnerabilities; production dependency audit passed with `--omit=dev`, but dev-chain vulnerabilities should still be reviewed before CI/CD.
9. Node 24 showed an engine warning for a JWT dependency. Production should use Node 20 LTS unless dependencies are upgraded and retested.

## Required Before Cloud 100%

1. Add cloud login UI and token storage flow.
2. Add attachment binary upload/download to Supabase Storage.
3. Add automatic singleton sync scheduler with debounce/backoff.
4. Add WebSocket client and fallback polling.
5. Add reconciliation screen for conflicts and dead-letter queue.
6. Convert high-volume data layer from localStorage to IndexedDB/Dexie.
7. Replace wallet snapshot sync with ledger/event sync or server-side balance reconciliation.
8. Add backend per-table Zod validation before accepting production traffic.
9. Add end-to-end tests for multi-device pay/receive/delete/restore flows.
10. Add refresh token reuse detection / revoke-old-token rotation.
11. Add CI checks for frontend build, backend build, Prisma generate, and dependency audit.

## Verification 2026-05-17

- Frontend `npm.cmd run build`: passed
- Backend `npm.cmd install`: completed, but showed dev dependency audit warnings and Node 24 engine warning
- Backend `npx.cmd prisma generate`: passed
- Backend `npm.cmd run build`: passed
- Backend `npm.cmd audit --omit=dev`: passed with 0 production vulnerabilities

## Risk Fixes 2026-05-17

- Added production guard: backend now refuses to start when `NODE_ENV=production` and `ALLOW_DEV_NO_AUTH=true`.
- Added refresh-token rotation hardening: used refresh tokens are revoked before issuing a new session.
- Added frontend manual chunks for large vendor libraries to reduce production bundle risk.
- Added `.gitignore` so build output, dependencies, and env files are not accidentally committed or deployed as source.

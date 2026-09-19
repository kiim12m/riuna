---
name: verify
description: Build/launch/drive recipe for verifying Riuna changes end-to-end on a local dev instance
---

# Verifying Riuna changes

## Launch

- `pnpm dev` starts API (1337) and web (5173) — but only from a real terminal. Check for a listener first; the user often already has both running. On Windows: `netstat -ano | grep LISTENING | grep ":1337 "`. On Unix: `lsof -nP -iTCP:1337 -sTCP:LISTEN`.
- **Headless, `pnpm dev` does not work.** With stdout redirected to a file and more than one persistent task running, the API never opens its port: turbo prints the `tsx watch` banner and nothing else — no error, no crash, the process just sits there. It is not a repo bug; it reproduces with api+web, api+mcp and api+email alike, and never with a single task. Launch the two you need separately instead: `pnpm --filter @riuna/api dev` and `pnpm --filter @riuna/web dev`. The API takes ~12s to listen (migrations run first), the web ~3s.
- `pnpm dev` runs four dev tasks, not two: `api`, `web`, `mcp` and `email`.
- API is `tsx watch`: it hot-restarts on any imported .ts change, but NOT on `apps/api/drizzle/*.sql` changes (manual restart needed after editing migrations).
- Migrations auto-run on API startup; a failed migration exits the process (port goes dead).

## Database access

- `DATABASE_URL=$(grep "^DATABASE_URL" .env | cut -d= -f2-); psql "$DATABASE_URL"` gives direct Postgres access for asserting rows (notification, task_reminder_sent, user_notification_preference).
- Gotcha: `task.userId` in Drizzle maps to column `assignee_id`, not `user_id`.
- When replicating scheduler SQL by hand, `SET timezone = 'UTC'` first; timestamps are naive UTC.

## Smoke tests (Playwright) — prefer these over a manual pass

`pnpm test:e2e` (or `test:e2e:ui`) runs `tests/e2e/` in Chromium. **Use this
before reaching for a browser by hand**: it is repeatable, it runs in CI, and it
does not depend on a browser tool being available in the session.

- It brings up **its own API (1338) + web (5174) against `riuna_e2e_test`**, so
  it never touches the dev database or needs the dev servers stopped. Create the
  database once: `CREATE DATABASE riuna_e2e_test;` (override the connection with
  `E2E_DATABASE_URL`).
- The API webServer runs `tsx src/index.ts`, **not** `pnpm dev`: with stdout
  piped, `tsx watch` prints its banner and never opens the port (same trap as
  above).
- The API reads `PORT`; without it, the e2e instance would collide with 1337.
- `use.locale` is `es-ES` on purpose. Chromium starts in `en-US` and the app
  resolves `user.locale → browser → default`, so without it the smoke would
  assert against an English UI no Riuna user sees.
- `tests/e2e/fixtures.ts` gives every test a fresh user, workspace and project
  built through the API, with the session already in the browser jar. **It also
  calls `organization/set-active`** — the sign-up alone does not, and screens
  without `workspaceId` in the route (project settings) depend on it.
- Base UI popovers, dialogs and tabs **do work** here. The Phase 4 note about
  them not opening headless was about a different tool, not Playwright.

## Driving flows

- Drive the web UI at localhost:5173 with claude-in-chrome; the user's session is usually signed in.
- Notification bell is top-left next to the workspace switcher; badge updates live over websocket (no refresh needed to observe delivery).
- Due-date picker is date-only (stores local midnight as naive UTC). To trigger the due-date reminder cron (every 5 min, 10-min lookback window) within a session: set the assignee's lead-time preference (Settings > Account > Notifications, in hours) or nudge `task.due_date` via psql so `due_date - lead` lands 2-3 min ahead.
- Preferences save button silently disables for out-of-range lead values.

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

## Driving flows

- Drive the web UI at localhost:5173 with Codex-in-chrome; the user's session is usually signed in.
- Notification bell is top-left next to the workspace switcher; badge updates live over websocket (no refresh needed to observe delivery).
- Due-date picker is date-only (stores local midnight as naive UTC). To trigger the due-date reminder cron (every 5 min, 10-min lookback window) within a session: set the assignee's lead-time preference (Settings > Account > Notifications, in hours) or nudge `task.due_date` via psql so `due_date - lead` lands 2-3 min ahead.
- Preferences save button silently disables for out-of-range lead values.

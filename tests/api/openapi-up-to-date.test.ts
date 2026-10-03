import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/index";

/**
 * `apps/api/openapi.json` es lo que lee quien integra con la API, y estuvo cinco
 * semanas sin regenerarse mientras se anadian rutas. Se compara con la
 * especificacion viva, salvo `servers`, que sale del `.env` de cada maquina.
 *
 * Si falla: `RIUNA_API_URL=http://localhost:1337 pnpm --filter @riuna/api openapi:export`.
 */
describe("openapi.json", () => {
  it("matches the routes and schemas the API serves", async () => {
    const response = await createApp().app.request("/api/openapi");
    expect(response.ok).toBe(true);

    const live = (await response.json()) as Record<string, unknown>;
    const committed = JSON.parse(
      readFileSync(
        new URL("../../apps/api/openapi.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;

    const { servers: _live, ...liveRest } = live;
    const { servers: _committed, ...committedRest } = committed;
    expect(liveRest).toEqual(committedRest);
  });
});

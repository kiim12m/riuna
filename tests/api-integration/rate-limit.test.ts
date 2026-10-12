import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// `setup.ts` apaga los limites para el resto de la integracion; este fichero
// los enciende (ADR 074). Antes de cargar la API, porque Better Auth lee el
// interruptor al construirse. Y al acabar los deja como estaban: si los
// ficheros llegan a compartir proceso, el siguiente no hereda un cupo de 5.
const previousEnv = vi.hoisted(() => {
  const previous = {
    RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
    RATE_LIMIT_USER_PER_MINUTE: process.env.RATE_LIMIT_USER_PER_MINUTE,
  };
  process.env.RATE_LIMIT_ENABLED = "true";
  process.env.RATE_LIMIT_USER_PER_MINUTE = "5";
  return previous;
});

import { createApp } from "../../apps/api/src/index";
import { resetRateLimits } from "../../apps/api/src/utils/rate-limit";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

beforeEach(async () => {
  await resetTestDatabase();
  resetRateLimits();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function times(count: number, request: () => Promise<Response>) {
  const statuses: number[] = [];
  let last: Response | undefined;
  for (let i = 0; i < count; i += 1) {
    last = await request();
    statuses.push(last.status);
  }
  return { statuses, last };
}

describe("rate limits (ADR 074)", () => {
  it("cuts a person off after their quota, with Retry-After, and leaves the rest alone", async () => {
    const { app } = createApp();
    const first = await createWorkspaceMember();
    const second = await createWorkspaceMember();

    mockAuthenticatedSession(first.user);
    const { statuses, last } = await times(6, () =>
      app.request("/api/notification/unread-count"),
    );

    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(Number(last?.headers.get("Retry-After"))).toBeGreaterThan(0);
    await expect(last?.json()).resolves.toEqual({
      message: "Too many requests",
    });

    vi.restoreAllMocks();
    mockAuthenticatedSession(second.user);
    const other = await app.request("/api/notification/unread-count");
    expect(other.status).toBe(200);
  });

  it("limits what is served without a session by IP", async () => {
    const { app } = createApp();

    const { statuses, last } = await times(31, () =>
      app.request("/api/invitation/public/no-existe"),
    );

    expect(statuses.slice(0, 30)).not.toContain(429);
    expect(statuses[30]).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });

  it("never limits the health check", async () => {
    const { app } = createApp();

    const { statuses } = await times(70, () => app.request("/api/health"));

    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  // Antes Better Auth leia `cf-connecting-ip` y `X-Forwarded-For` sin mirar de
  // donde venia la conexion: con una IP inventada en cada intento, el cupo no
  // se gastaba nunca.
  it("stops password guessing even when every attempt claims another IP", async () => {
    const { app } = createApp();

    const { statuses } = await times(11, async () => {
      const fake = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
      return app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": fake,
          "cf-connecting-ip": fake,
          "x-riuna-client-ip": fake,
        },
        body: JSON.stringify({
          email: "nadie@example.com",
          password: "no-es-esta",
        }),
      });
    });

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});

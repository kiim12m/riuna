import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../apps/api/src/index";
import { log } from "../../apps/api/src/utils/log";

// Lo que escribe el registro, como objetos: una linea JSON por llamada.
let lines: Record<string, unknown>[] = [];

function capture(stream: NodeJS.WriteStream) {
  vi.spyOn(stream, "write").mockImplementation((chunk) => {
    for (const line of String(chunk).split("\n").filter(Boolean)) {
      lines.push(JSON.parse(line));
    }
    return true;
  });
}

beforeEach(() => {
  lines = [];
  vi.stubEnv("LOG_FORMAT", "json");
  capture(process.stdout);
  capture(process.stderr);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const requests = () => lines.filter((line) => line.msg === "request");

describe("request log (ADR 073)", () => {
  it("writes one line per request, with the route pattern and never the raw path", async () => {
    const { app } = createApp();
    const token = "secreto-del-calendario-123";

    const response = await app.request(`/api/calendar/${token}.ics`);

    expect(response.status).toBe(404);
    const [line] = requests();
    expect(line).toMatchObject({
      level: "info",
      method: "GET",
      status: 404,
    });
    expect(line?.route).toContain("/api/calendar/:file");
    expect(typeof line?.durationMs).toBe("number");
    expect(JSON.stringify(lines)).not.toContain(token);
  });

  it("keeps the health check quiet but still answers with a request id", async () => {
    const { app } = createApp();

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(requests()).toHaveLength(0);
  });

  it("honours a sane incoming X-Request-Id and stamps every line of the request with it", async () => {
    const { app } = createApp();
    // Las rutas de sondeo van fuera de `/api`, para no pasar por la autenticacion.
    app.get("/__log-probe", (c) => {
      log.info("inside the handler");
      return c.json({ ok: true });
    });

    const response = await app.request("/__log-probe", {
      headers: { "X-Request-Id": "probe-42" },
    });

    expect(response.headers.get("X-Request-Id")).toBe("probe-42");
    const inside = lines.find((line) => line.msg === "inside the handler");
    expect(inside?.requestId).toBe("probe-42");
    expect(requests()[0]?.requestId).toBe("probe-42");
  });

  it("replaces an incoming id that is not reasonable", async () => {
    const { app } = createApp();

    const response = await app.request("/api/health", {
      headers: { "X-Request-Id": "x".repeat(500) },
    });

    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Hasta la Fase 9 un 500 solo iba a Sentry, inactivo sin DSN: no quedaba
  // nada en ningun sitio.
  it("leaves the stack of an unhandled error, tied to its request", async () => {
    const { app } = createApp();
    app.get("/__boom", () => {
      throw new Error("se rompio el disco");
    });

    const response = await app.request("/__boom");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Internal Server Error",
    });
    const requestId = response.headers.get("X-Request-Id");
    const failure = lines.find((line) => line.msg === "Unhandled error");
    expect(failure).toMatchObject({
      level: "error",
      requestId,
      route: "/__boom",
      error: { message: "se rompio el disco" },
    });
    const stack = (failure?.error as { stack?: string } | undefined)?.stack;
    expect(String(stack)).toContain("request-log.test.ts");
    expect(requests()[0]).toMatchObject({ level: "error", status: 500 });
  });
});

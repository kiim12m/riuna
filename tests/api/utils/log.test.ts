import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEntry,
  log,
  withRequestContext,
} from "../../../apps/api/src/utils/log";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function captureStream(stream: NodeJS.WriteStream) {
  const lines: string[] = [];
  vi.spyOn(stream, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

describe("buildEntry", () => {
  it("takes the first string as the message and merges plain objects as fields", () => {
    const entry = buildEntry("info", [
      "Tarea movida",
      { taskId: "t1" },
      { n: 2 },
    ]);

    expect(entry).toMatchObject({
      level: "info",
      msg: "Tarea movida",
      taskId: "t1",
      n: 2,
    });
    expect(entry.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps an error with its stack and cause", () => {
    const cause = new Error("connection refused");
    const error = new Error("No se pudo enviar", { cause });

    const entry = buildEntry("error", ["Fallo", error]);

    expect(entry.error).toMatchObject({
      name: "Error",
      message: "No se pudo enviar",
      cause: { message: "connection refused" },
    });
    expect((entry.error as { stack: string }).stack).toContain("log.test.ts");
  });

  it("puts what is neither text, error nor plain object in details", () => {
    const entry = buildEntry("warn", ["Raro", 42, "otra cosa"]);

    expect(entry.details).toEqual([42, "otra cosa"]);
  });

  it("logs an error passed alone, without a message", () => {
    const entry = buildEntry("error", [new Error("solo")]);

    expect(entry.msg).toBe("");
    expect(entry.error).toMatchObject({ message: "solo" });
  });

  it("never writes a secret, at any depth", () => {
    const entry = buildEntry("info", [
      "Peticion",
      {
        password: "hunter2",
        headers: { authorization: "Bearer abc", cookie: "s=1", accept: "*/*" },
        apiKey: "rk_123",
        webhook: { secretToken: "zzz", url: "https://example.com" },
        passed: 3,
      },
    ]);

    const text = JSON.stringify(entry);
    for (const secret of ["hunter2", "Bearer abc", "s=1", "rk_123", "zzz"]) {
      expect(text).not.toContain(secret);
    }
    expect(entry).toMatchObject({
      password: "[redacted]",
      headers: { authorization: "[redacted]", accept: "*/*" },
      webhook: { url: "https://example.com" },
      passed: 3,
    });
  });

  it("survives circular and deep values", () => {
    const loop: Record<string, unknown> = { name: "a" };
    loop.self = loop;
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 10; i += 1) deep = { deep };

    const entry = buildEntry("info", ["Raro", { loop, deep }]);

    expect(() => JSON.stringify(entry)).not.toThrow();
    expect(JSON.stringify(entry)).toContain("[circular]");
  });

  it("cannot have its header overwritten by a field", () => {
    const entry = buildEntry("info", [
      "Real",
      { level: "debug", msg: "falso" },
    ]);

    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("Real");
  });

  it("carries the request id of the request it runs inside", () => {
    const entry = withRequestContext("req-1", () => buildEntry("info", ["x"]));

    expect(entry.requestId).toBe("req-1");
    expect(buildEntry("info", ["y"]).requestId).toBeUndefined();
  });
});

describe("log", () => {
  it("writes one JSON line per call in json format", () => {
    vi.stubEnv("LOG_FORMAT", "json");
    const out = captureStream(process.stdout);

    log.info("Hola", { taskId: "t1" });

    expect(out).toHaveLength(1);
    expect(out[0]?.endsWith("\n")).toBe(true);
    expect(JSON.parse(out[0] ?? "")).toMatchObject({
      level: "info",
      msg: "Hola",
      taskId: "t1",
    });
  });

  it("sends warnings and errors to stderr", () => {
    vi.stubEnv("LOG_FORMAT", "json");
    const out = captureStream(process.stdout);
    const err = captureStream(process.stderr);

    log.warn("Cuidado");
    log.error("Mal", new Error("x"));

    expect(out).toHaveLength(0);
    expect(err).toHaveLength(2);
  });

  it("drops what is below LOG_LEVEL", () => {
    vi.stubEnv("LOG_FORMAT", "json");
    vi.stubEnv("LOG_LEVEL", "warn");
    const out = captureStream(process.stdout);
    const err = captureStream(process.stderr);

    log.debug("no");
    log.info("tampoco");
    log.warn("si");

    expect(out).toHaveLength(0);
    expect(err).toHaveLength(1);
  });

  it("is readable in pretty format, with the stack below", () => {
    vi.stubEnv("LOG_FORMAT", "pretty");
    const err = captureStream(process.stderr);

    log.error("Fallo al guardar", new Error("disco lleno"), { taskId: "t1" });

    const [line = ""] = err;
    expect(line).toMatch(
      /^\d{2}:\d{2}:\d{2}\.\d{3} ERROR Fallo al guardar taskId=t1\n/,
    );
    expect(line).toContain("Error: disco lleno");
  });
});

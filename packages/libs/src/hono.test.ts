import { afterEach, describe, expect, it, vi } from "vitest";
import { apiHeaders, client, onRateLimited } from "./hono";

describe("apiHeaders", () => {
  it("sends JSON by default", () => {
    expect(apiHeaders({ body: "{}" })).toMatchObject({
      "Content-Type": "application/json",
    });
  });

  // El fallo que esto cierra: con `Content-Type: application/json` forzado, un
  // `FormData` llegaba al servidor sin un solo campo y el asistente de
  // importacion no funcionaba en ningun navegador.
  it("leaves the content type to the browser for a multipart upload", () => {
    const form = new FormData();
    form.append("file", new Blob(["a,b"]), "obra.csv");

    const headers = apiHeaders({ body: form }) as Record<string, string>;

    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers["X-Riuna-Window-Id"]).toBeTruthy();
  });

  it("keeps the headers the caller already set", () => {
    expect(apiHeaders({ headers: { "X-Test": "1" } })).toMatchObject({
      "X-Test": "1",
    });
  });
});

describe("onRateLimited", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Un 429 de la API (ADR 074) llega a la web, que lo explica traducido.
  it("tells its listeners how long to wait after a 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "Too many requests" }), {
            status: 429,
            headers: { "Retry-After": "42" },
          }),
      ),
    );
    const heard: number[] = [];
    const stop = onRateLimited((seconds) => heard.push(seconds));

    const response = await client.invitation.public[":id"].$get({
      param: { id: "x" },
    });
    stop();
    await client.invitation.public[":id"].$get({ param: { id: "x" } });

    expect(response.status).toBe(429);
    expect(heard).toEqual([42]);
  });

  it("stays quiet for anything else", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const heard: number[] = [];
    const stop = onRateLimited((seconds) => heard.push(seconds));

    await client.invitation.public[":id"].$get({ param: { id: "x" } });
    stop();

    expect(heard).toEqual([]);
  });
});

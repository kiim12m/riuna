import { describe, expect, it } from "vitest";
import { apiHeaders } from "./hono";

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

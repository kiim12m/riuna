import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

// `peer` es quien abre la conexion con la API: `X-Forwarded-For` solo cuenta
// si es un proxy de confianza (ADR 074). `app.request()` no tiene socket, asi
// que se le da el que `getConnInfo` lee en node-server.
async function signUpWithForwardedFor(forwardedFor: string, peer: string) {
  const { app } = createApp();
  const email = `ip-${randomUUID()}@example.com`;

  const response = await app.request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": forwardedFor,
      },
      body: JSON.stringify({
        email,
        password: "TestPassw0rd!23",
        name: "IP Probe",
      }),
    },
    { incoming: { socket: { remoteAddress: peer } } },
  );

  expect(response.status).toBeLessThan(400);

  const [user] = await db
    .select()
    .from(schema.userTable)
    .where(eq(schema.userTable.email, email));

  const [session] = await db
    .select()
    .from(schema.sessionTable)
    .where(eq(schema.sessionTable.userId, user.id))
    .orderBy(desc(schema.sessionTable.createdAt))
    .limit(1);

  return session;
}

describe("session records the real client IP behind the proxy chain", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("stores the client, not the in-image nginx or Caddy hop", async () => {
    const session = await signUpWithForwardedFor(
      "203.0.113.9, 172.19.0.5",
      "127.0.0.1",
    );

    expect(session.ipAddress).toBe("203.0.113.9");
  });

  it("still works with a single proxy in front", async () => {
    const session = await signUpWithForwardedFor("203.0.113.40", "172.17.0.1");

    expect(session.ipAddress).toBe("203.0.113.40");
  });

  // Antes Better Auth se fiaba de la cabecera viniera de donde viniera.
  it("ignores X-Forwarded-For from a connection that is not a trusted proxy", async () => {
    const session = await signUpWithForwardedFor(
      "203.0.113.66",
      "198.51.100.7",
    );

    expect(session.ipAddress).toBe("198.51.100.7");
  });
});

// Revision de la Fase 9, hallazgo 7: Turnstile recibia `cf-connecting-ip` o el
// primer `X-Forwarded-For`, que escribe quien llama.
describe("Turnstile gets the resolved client IP", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    // Con la base vacia, el registro es el del admin de instancia, que no pasa
    // por Turnstile.
    await createWorkspaceMember();
    vi.stubEnv("RIUNA_CLOUD", "true");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the IP the proxy chain resolves, not one the caller made up", async () => {
    const realFetch = globalThis.fetch;
    const sent: URLSearchParams[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("challenges.cloudflare.com")) {
        sent.push(new URLSearchParams(String(init?.body)));
        return Response.json({ success: true });
      }
      return realFetch(input, init);
    });
    const { app } = createApp();

    const response = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "7.7.7.7",
          "x-forwarded-for": "6.6.6.6, 203.0.113.9",
          "x-turnstile-token": "token",
        },
        body: JSON.stringify({
          email: `turnstile-${randomUUID()}@example.com`,
          password: "TestPassw0rd!23",
          name: "Turnstile Probe",
        }),
      },
      { incoming: { socket: { remoteAddress: "127.0.0.1" } } },
    );

    expect(response.status).toBeLessThan(400);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.get("remoteip")).toBe("203.0.113.9");
  });
});

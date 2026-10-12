import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";

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

import { createHash, randomUUID } from "node:crypto";
import type { Session, User } from "better-auth/types";
import { eq } from "drizzle-orm";
import { expect, vi } from "vitest";
import { auth } from "../../../apps/api/src/auth";
import db, { schema } from "../../../apps/api/src/database";
import { createApp } from "../../../apps/api/src/index";

function createSession(userId: string): Session {
  const now = new Date();

  return {
    id: `session-${userId}`,
    token: `token-${userId}`,
    userId,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  };
}

export function mockAuthenticatedSession(user: User) {
  return vi.spyOn(auth.api, "getSession").mockResolvedValue({
    session: createSession(user.id),
    user,
  });
}

export function mockAnonymousSession() {
  return vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
}

// `mockAuthenticatedSession` solo espia `auth.api.getSession`. Los endpoints
// de Better Auth que se llaman desde un controlador (`createInvitation`, ...)
// leen la sesion de la cookie por su cuenta y no pasan por ese espia, asi que
// para ejercitarlos hace falta una sesion de verdad.
export async function signUpWithCookie() {
  const { app } = createApp();
  const email = `sesion-${randomUUID()}@example.com`;

  const response = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassw0rd!23",
      name: "Sesion Real",
    }),
  });
  expect(response.status).toBeLessThan(400);

  const [user] = await db
    .select()
    .from(schema.userTable)
    .where(eq(schema.userTable.email, email));

  const cookie = response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");

  return { user, cookie };
}

/**
 * Una clave de API de verdad para `userId`, con el alcance dado (o sin
 * alcance, que pasa por todo). Devuelve la clave en claro, para mandarla en
 * `x-api-key`; la base guarda su hash, como hace Better Auth.
 */
export async function createApiKey(
  userId: string,
  permissions?: Record<string, string[]>,
) {
  const plainKey = `riuna_${randomUUID()}`;
  const hashed = createHash("sha256")
    .update(plainKey)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  await db.insert(schema.apikeyTable).values({
    id: `apikey-${randomUUID()}`,
    name: "Prueba",
    key: hashed,
    userId,
    referenceId: userId,
    enabled: true,
    ...(permissions ? { permissions: JSON.stringify(permissions) } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return plainKey;
}

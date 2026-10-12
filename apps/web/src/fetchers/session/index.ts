import { client } from "@riuna/libs";

// Sesiones activas (ADR 079): las de quien pregunta, sin sus tokens.

async function readOrThrow<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function getMySessions() {
  return readOrThrow(await client.session.$get());
}

export async function revokeSession(id: string) {
  return readOrThrow(await client.session[":id"].$delete({ param: { id } }));
}

export async function revokeOtherSessions() {
  return readOrThrow(await client.session.others.$delete());
}

export type ActiveSession = Awaited<ReturnType<typeof getMySessions>>[number];

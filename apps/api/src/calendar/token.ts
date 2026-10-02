import { createHash, randomBytes } from "node:crypto";

/** 32 bytes en base64url: 43 caracteres de este alfabeto, y nada mas. */
export const FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Solo se guarda el hash (ADR 057): el token se enseña una vez. */
export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createFeedToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashFeedToken(token) };
}

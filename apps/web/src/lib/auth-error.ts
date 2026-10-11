import type { TFunction } from "i18next";

/**
 * El texto de un error de Better Auth en un formulario de acceso. Un 429 se
 * explica en el idioma de quien lo lee (ADR 074): el mensaje del servidor
 * viene en inglés. Lo demás, como venía, o el texto de reserva.
 */
export function authErrorMessage(
  t: TFunction,
  error: { status?: number; message?: string } | null | undefined,
  fallbackKey: string,
) {
  if (error?.status === 429) return t("common:error.messages.tooManyAttempts");
  return error?.message || t(fallbackKey);
}

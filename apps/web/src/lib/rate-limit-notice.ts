import { onRateLimited } from "@riuna/libs";
import i18n from "i18next";
import { toast } from "@/lib/toast";

// Una pantalla dispara varias peticiones a la vez: si la API corta, cortan
// todas. Un solo aviso por tanda basta.
const QUIET_MS = 10_000;

/**
 * Explica un 429 de la API (ADR 074) con un aviso traducido. Las consultas no
 * lo reintentan (`isClientError`): volver a pedir solo alarga la espera.
 */
export function installRateLimitNotice() {
  let lastShown = 0;
  return onRateLimited((seconds) => {
    const now = Date.now();
    if (now - lastShown < QUIET_MS) return;
    lastShown = now;
    toast.warning(i18n.t("common:error.messages.rateLimited", { seconds }));
  });
}

import { HTTPException } from "hono/http-exception";
import {
  decryptSecret,
  encryptSecret,
} from "../notification-preferences/secrets";
import type { Action } from "./definition";

/** Una accion como se guarda: con sus secretos ya cifrados. */
export type StoredAction = Action;

function seal(value: string): string {
  // Sin clave, `encryptSecret` responde 500 sin decir por que. Guardar una
  // regla es un gesto de quien administra: que sepa que falta.
  if (!process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY?.trim()) {
    throw new HTTPException(400, {
      message:
        "NOTIFICATION_SECRET_ENCRYPTION_KEY is not set: this instance cannot store secrets",
    });
  }
  return encryptSecret(value) as string;
}

/**
 * Un secreto que llega: ausente conserva el guardado, vacio lo quita, y
 * cualquier otro valor se cifra. Asi se puede editar una regla sin volver a
 * pegar el token, que la API nunca devuelve.
 */
function merge(
  incoming: string | undefined,
  previous: string | undefined,
): string | undefined {
  if (incoming === undefined) return previous;
  if (incoming.trim() === "") return undefined;
  return seal(incoming.trim());
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

/** Cifra los secretos de las acciones, conservando los de la version anterior. */
export function sealActions(
  incoming: readonly Action[],
  previous: readonly StoredAction[] = [],
): StoredAction[] {
  const before = new Map(previous.map((action) => [action.id, action]));

  return incoming.map((action) => {
    const old = before.get(action.id);

    if (action.type === "webhook") {
      const oldSecret = old?.type === "webhook" ? old.secret : undefined;
      return withoutUndefined({
        ...action,
        secret: merge(action.secret, oldSecret),
      });
    }

    if (action.type === "chat" && action.destination) {
      const oldDestination = old?.type === "chat" ? old.destination : undefined;
      return {
        ...action,
        destination: withoutUndefined({
          ...action.destination,
          webhookUrl: merge(
            action.destination.webhookUrl,
            oldDestination?.webhookUrl,
          ),
          botToken: merge(
            action.destination.botToken,
            oldDestination?.botToken,
          ),
        }),
      };
    }

    return action;
  });
}

/**
 * Las acciones como salen por la API: los secretos se cambian por un aviso de
 * que estan puestos. Una URL de webhook de Slack o Discord es en si misma la
 * credencial del canal, asi que tampoco sale.
 */
export function publicActions(stored: readonly StoredAction[]) {
  return stored.map((action) => {
    if (action.type === "webhook") {
      const { secret, ...rest } = action;
      return { ...rest, hasSecret: Boolean(secret) };
    }

    if (action.type === "chat" && action.destination) {
      const { webhookUrl, botToken, ...rest } = action.destination;
      return {
        ...action,
        destination: {
          ...rest,
          hasWebhookUrl: Boolean(webhookUrl),
          hasBotToken: Boolean(botToken),
        },
      };
    }

    return action;
  });
}

export function openSecret(value: string | undefined): string | undefined {
  return value ? (decryptSecret(value) ?? undefined) : undefined;
}

import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";

const EVENTS = new EventEmitter();
EVENTS.setMaxListeners(100);
export const eventContext = new AsyncLocalStorage<{ initiatorId: string }>();

export type EventPayload<T = unknown> = {
  type: string;
  data: T;
  timestamp: string;
};

// Los gestores en marcha. `publishEvent` solo emite y los gestores corren por su
// cuenta, asi que sin esto nadie puede saber cuando han acabado.
const RUNNING = new Set<Promise<void>>();

/** Espera a que acaben los gestores que hay en marcha, y los que estos lancen. */
export async function settleEvents(): Promise<void> {
  while (RUNNING.size > 0) {
    await Promise.allSettled([...RUNNING]);
  }
}

/**
 * Publica muchos eventos por tandas, esperando a que cada una drene antes de
 * lanzar la siguiente.
 *
 * Una importacion de miles de tareas emitia todos sus `task.created` de golpe,
 * y cada uno despierta a varios gestores que consultan la base: miles de
 * consultas contra un pool de 10 con cinco segundos de espera, y los que no
 * conseguian conexion perdian su actividad en silencio ("Error processing event
 * task.created: timeout exceeded when trying to connect").
 */
export async function publishEventsPaced(
  events: { type: string; data: unknown }[],
  batchSize = 20,
): Promise<void> {
  for (let start = 0; start < events.length; start += batchSize) {
    for (const { type, data } of events.slice(start, start + batchSize)) {
      await publishEvent(type, data);
    }
    await settleEvents();
  }
}

export async function shutdownEventBus(): Promise<void> {
  EVENTS.removeAllListeners();
}

export async function publishEvent(
  eventType: string,
  data: unknown,
): Promise<void> {
  let enhancedData = null;
  if (typeof data === "object" && data !== null) {
    const store = eventContext.getStore();
    enhancedData = { ...data, initiatorId: store?.initiatorId };
  }

  const payload: EventPayload = {
    type: eventType,
    data: enhancedData || data,
    timestamp: new Date().toISOString(),
  };

  try {
    EVENTS.emit(eventType, payload);
  } catch (error) {
    console.error("Failed to publish event:", error);
    throw error;
  }
}

export async function subscribeToEvent<T>(
  eventType: string,
  handler: (data: T) => Promise<void>,
): Promise<void> {
  try {
    EVENTS.on(eventType, (payload: EventPayload<T>) => {
      const running = (async () => {
        try {
          await handler(payload.data);
        } catch (error) {
          console.error(`Error processing event ${eventType}:`, error);
        }
      })();
      RUNNING.add(running);
      void running.finally(() => RUNNING.delete(running));
    });
  } catch (error) {
    console.error("Failed to subscribe to event:", error);
    throw error;
  }
}

process.on("SIGTERM", () => {
  shutdownEventBus().catch(console.error);
});

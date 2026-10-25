import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { log } from "../utils/log";

const EVENTS = new EventEmitter();
EVENTS.setMaxListeners(100);
/**
 * Quien provoca lo que se publica. Una automatizacion (ADR 067) corre sus
 * acciones con su propio contexto: los eventos que estas publican llevan la
 * cadena de reglas que los causo, que es lo que corta un bucle A→B→A, y la
 * actividad sabe que el autor es la regla y no una persona.
 */
export type EventContext = {
  initiatorId: string;
  automation?: {
    id: string;
    name: string;
    chain: string[];
    /** Quien pulso una accion de un clic (ADR 078). */
    pressedBy?: string;
  };
};

export const eventContext = new AsyncLocalStorage<EventContext>();

export type EventPayload<T = unknown> = {
  type: string;
  data: T;
  timestamp: string;
};

// Los gestores en marcha. `publishEvent` solo emite y los gestores corren por su
// cuenta, asi que sin esto nadie puede saber cuando han acabado.
const RUNNING = new Set<Promise<void>>();

// Los gestores que lanza la tanda que se esta publicando. `EVENTS.emit` llama a
// los oyentes de forma sincrona, asi que basta con tenerla puesta mientras dura
// el `emit`.
let collecting: Promise<void>[] | null = null;

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
    const batch: Promise<void>[] = [];
    for (const { type, data } of events.slice(start, start + batchSize)) {
      // `publishEvent` emite antes de su primer `await`: se recoge solo durante
      // esa parte sincrona, para no apuntar gestores de otra peticion que se
      // cuele mientras se espera.
      collecting = batch;
      let published: Promise<void>;
      try {
        published = publishEvent(type, data);
      } finally {
        collecting = null;
      }
      await published;
    }
    // Solo los gestores de **esta** tanda: esperar a todos los del proceso
    // (`settleEvents`) ataria la importacion a un webhook lento de otra peticion.
    await Promise.allSettled(batch);
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
    enhancedData = {
      ...data,
      initiatorId: store?.initiatorId,
      ...(store?.automation ? { automation: store.automation } : {}),
    };
  }

  const payload: EventPayload = {
    type: eventType,
    data: enhancedData || data,
    timestamp: new Date().toISOString(),
  };

  try {
    EVENTS.emit(eventType, payload);
  } catch (error) {
    log.error("Failed to publish event:", error);
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
          log.error(`Error processing event ${eventType}:`, error);
        }
      })();
      RUNNING.add(running);
      collecting?.push(running);
      void running.finally(() => RUNNING.delete(running));
    });
  } catch (error) {
    log.error("Failed to subscribe to event:", error);
    throw error;
  }
}

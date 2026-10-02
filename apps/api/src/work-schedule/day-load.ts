import type { MinuteInterval } from "./day-capacity";

export type DayLoad = {
  /** Lo que queda por hacer ese dia, en segundos. */
  loadSeconds: number;
  /** La capacidad del dia (`capacityForDay`): 0 si no es laborable. */
  capacitySeconds: number;
  /** `loadSeconds / capacitySeconds`, en %. Sin capacidad, 100 si hay carga. */
  pct: number;
};

/**
 * La carga de un dia: lo que queda de cada tarea planificada y sin terminar
 * -estimacion menos lo ya registrado, nunca negativo- mas la duracion de los
 * bloques fijos, frente a la capacidad del dia (ADR 045).
 *
 * Una sola formula para el Planificador y el Cronograma (ADR 050): hasta ahora
 * el Planificador la calculaba en el navegador, contando tambien lo ya hecho,
 * y el Cronograma sumaba la duracion de sus tramos -con los 30 min de relleno
 * de lo no estimado- frente a la jornada bruta, sin restar la comida ni los
 * dias libres. El mismo dia salia con dos porcentajes distintos.
 */
export function dayLoad({
  entries,
  fixedBlocks,
  capacitySeconds,
}: {
  entries: {
    estimate: number | null;
    loggedSeconds: number;
    isDone: boolean;
  }[];
  fixedBlocks: MinuteInterval[];
  capacitySeconds: number;
}): DayLoad {
  const remainingSeconds = entries
    .filter((entry) => !entry.isDone)
    .reduce(
      (total, entry) =>
        total + Math.max(0, (entry.estimate ?? 0) - entry.loggedSeconds),
      0,
    );
  const fixedSeconds = fixedBlocks.reduce(
    (total, block) => total + (block.endMinute - block.startMinute) * 60,
    0,
  );
  const loadSeconds = remainingSeconds + fixedSeconds;

  return {
    loadSeconds,
    capacitySeconds,
    pct:
      capacitySeconds > 0
        ? Math.round((loadSeconds / capacitySeconds) * 100)
        : loadSeconds > 0
          ? 100
          : 0,
  };
}

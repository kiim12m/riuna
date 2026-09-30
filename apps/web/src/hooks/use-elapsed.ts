import { useEffect, useState } from "react";

/**
 * Segundos transcurridos desde `startTime`, recalculados cada segundo.
 * `startTime` es `undefined` cuando no hay nada en marcha -el intervalo ni
 * arranca-, que es lo que evita que el pie de la barra tenga un `setInterval`
 * corriendo en cada pestaña aunque nadie este cronometrando nada.
 */
export function useElapsed(startTime: string | Date | undefined): number {
  const startMs = startTime ? new Date(startTime).getTime() : undefined;

  const [elapsed, setElapsed] = useState(() =>
    startMs === undefined
      ? 0
      : Math.max(0, Math.floor((Date.now() - startMs) / 1000)),
  );

  useEffect(() => {
    if (startMs === undefined) {
      setElapsed(0);
      return;
    }

    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startMs]);

  return elapsed;
}

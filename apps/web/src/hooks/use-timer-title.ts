import { useEffect } from "react";

/** `00:42:17 · `, siempre al principio: lo que este hook antepone y retira. */
const PREFIX_PATTERN = /^\d{2}:\d{2}:\d{2} · /;

/**
 * Antepone el reloj del cronometro al titulo de la pestana -`00:42 ·
 * Revisar cuadro electrico`-, sin pelearse con `PageTitle`: cada ruta sigue
 * escribiendo su propio titulo con `document.title =`, y este hook lo lee
 * tal cual en cada tick, le quita el prefijo que puso la vez anterior y pone
 * el de ahora. Al parar, la ultima pasada lo deja limpio.
 */
export function useTimerTitle(elapsedClock: string | undefined) {
  useEffect(() => {
    if (!elapsedClock) {
      document.title = document.title.replace(PREFIX_PATTERN, "");
      return;
    }

    const clean = document.title.replace(PREFIX_PATTERN, "");
    document.title = `${elapsedClock} · ${clean}`;

    return () => {
      document.title = document.title.replace(PREFIX_PATTERN, "");
    };
  }, [elapsedClock]);
}

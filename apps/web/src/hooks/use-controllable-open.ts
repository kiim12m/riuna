import { useCallback, useRef, useState } from "react";

/**
 * El `open` de un desplegable que puede gobernar quien lo pinta -los atajos
 * `s`/`p`/`a`/`l`/`d` del detalle de la tarea abren los selectores del lateral
 * de propiedades- o, si no lo gobierna nadie, el propio desplegable. Los
 * cinco selectores de ese lateral repetian el mismo `useState(false)`.
 *
 * El setter es estable, como el de `useState`: los selectores lo usan dentro
 * de `useCallback`, y uno nuevo en cada render los rehacia todos.
 */
export function useControllableOpen(
  open: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
): [boolean, (open: boolean) => void] {
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;

  const latest = useRef({ controlled, onOpenChange });
  latest.current = { controlled, onOpenChange };

  const setOpen = useCallback((next: boolean) => {
    if (!latest.current.controlled) setInternalOpen(next);
    latest.current.onOpenChange?.(next);
  }, []);

  return [controlled ? (open as boolean) : internalOpen, setOpen];
}

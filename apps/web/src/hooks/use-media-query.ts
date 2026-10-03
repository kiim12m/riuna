import { useEffect, useState } from "react";

/**
 * Si la consulta de medios casa ahora mismo, y se actualiza al cambiar.
 * `useIsMobile` es el caso fijo de 768 px; esto sirve para otras fronteras,
 * como la `lg` (1024 px) a partir de la cual el lateral de propiedades de una
 * tarea pinta su disposicion de escritorio.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

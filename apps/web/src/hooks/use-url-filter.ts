import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { buildFilter, type EditableCondition } from "@/types/task-filter";

/**
 * Lee y escribe el filtro que vive en la busqueda de la URL.
 *
 * Va en la URL y no en estado local para que un tablero filtrado se pueda
 * pegar en un mensaje, y porque es lo que las vistas guardadas serializan tal
 * cual. Ver la ADR 015.
 *
 * Ojo con TanStack Router: serializa y parsea la busqueda con `JSON.parse`, asi
 * que las condiciones viajan como array y no como cadena. Mandarlas como
 * cadena JSON las hace llegar ya convertidas, y comprobar `typeof === "string"`
 * las descarta en silencio.
 */
export function useUrlFilter(conditions: EditableCondition[] | undefined) {
  const navigate = useNavigate();

  const current = useMemo(() => conditions ?? [], [conditions]);

  const setConditions = useCallback(
    (next: EditableCondition[]) => {
      navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          filter: next.length > 0 ? next : undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const filter = useMemo(() => buildFilter(current), [current]);

  return { conditions: current, setConditions, filter };
}

/** Lee las condiciones de una busqueda ya parseada por el router. */
export function readFilterParam(raw: unknown): EditableCondition[] | undefined {
  return Array.isArray(raw) ? (raw as EditableCondition[]) : undefined;
}

export default useUrlFilter;

import { useCallback, useEffect, useState } from "react";
import type { SortConfig, SortDirection, SortField } from "@/lib/sort-tasks";

const DEFAULT_SORT: SortConfig = {
  field: "position",
  direction: "asc",
};

const SORT_FIELD_MAP: Record<SortField, true> = {
  position: true,
  createdAt: true,
  priority: true,
  dueDate: true,
  title: true,
  number: true,
};

const SORT_FIELDS = Object.keys(SORT_FIELD_MAP) as readonly SortField[];

const SORT_DIRECTION_MAP: Record<SortDirection, true> = {
  asc: true,
  desc: true,
};

const SORT_DIRECTIONS = Object.keys(
  SORT_DIRECTION_MAP,
) as readonly SortDirection[];

function isSortField(value: unknown): value is SortField {
  return SORT_FIELDS.includes(value as SortField);
}

function isSortDirection(value: unknown): value is SortDirection {
  return SORT_DIRECTIONS.includes(value as SortDirection);
}

function normalizeSort(value: unknown): SortConfig {
  if (!value || typeof value !== "object") {
    return DEFAULT_SORT;
  }

  const candidate = value as Partial<Record<keyof SortConfig, unknown>>;

  if (!isSortField(candidate.field) || !isSortDirection(candidate.direction)) {
    return DEFAULT_SORT;
  }

  return { field: candidate.field, direction: candidate.direction };
}

function readStored(storageKey: string | null): SortConfig {
  if (!storageKey || typeof window === "undefined") return DEFAULT_SORT;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return DEFAULT_SORT;

    return normalizeSort(JSON.parse(stored) as unknown);
  } catch {
    return DEFAULT_SORT;
  }
}

function writeStored(storageKey: string | null, sort: SortConfig) {
  if (!storageKey || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(sort));
  } catch {
    // persistence is best-effort; private mode or quota can block writes
  }
}

/**
 * El orden se recuerda por proyecto en el navegador.
 *
 * Se escribe al cambiar, no en un efecto que dependa del valor: con un efecto
 * de escritura, el primer render lo dispara con el valor inicial y pisa lo
 * guardado antes de que el de lectura llegue a aplicarse, de modo que recargar
 * la pagina deshacia la eleccion. Lo guardado se lee en la inicializacion
 * perezosa, asi que el primer render ya ordena bien y la lista no parpadea.
 */
export function useBoardSort(projectId: string | undefined) {
  const storageKey = projectId ? `riuna:board-sort:${projectId}` : null;
  const [sort, setSort] = useState<SortConfig>(() => readStored(storageKey));

  // Cambiar de proyecto sin desmontar el componente tiene que traer el orden
  // del proyecto nuevo.
  useEffect(() => {
    setSort(readStored(storageKey));
  }, [storageKey]);

  const changeSort = useCallback(
    (next: SortConfig) => {
      setSort(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );

  return { sort, setSort: changeSort };
}

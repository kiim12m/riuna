import { useEffect, useMemo, useState } from "react";
import { type BoardFilters, buildTaskViewFilter } from "@/lib/task-view-filter";
import { useUserPreferencesStore } from "@/store/user-preferences";

const DEFAULT_FILTERS: BoardFilters = {
  status: null,
  priority: null,
  assignee: null,
  team: null,
  dueDate: null,
  labels: null,
  epics: null,
};

const FILTER_KEYS = Object.keys(DEFAULT_FILTERS) as Array<keyof BoardFilters>;

/** Lo que tarda el buscador en pedir al servidor tras la ultima tecla. */
const TEXT_DEBOUNCE_MS = 250;

function normalizeFilters(raw: unknown): BoardFilters {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_FILTERS;
  }

  const candidate = raw as Partial<Record<keyof BoardFilters, unknown>>;
  const normalized = { ...DEFAULT_FILTERS };

  for (const key of FILTER_KEYS) {
    const value = candidate[key];
    if (Array.isArray(value)) {
      const values = value.filter((v): v is string => typeof v === "string");
      normalized[key] = values.length > 0 ? values : null;
    }
  }

  return normalized;
}

function readFilters(storageKey: string | null): BoardFilters {
  if (!storageKey || typeof window === "undefined") return DEFAULT_FILTERS;

  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? normalizeFilters(JSON.parse(stored)) : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

type Options = {
  projectId?: string;
  /** La clave del proyecto, para que `DEP-23` en el buscador sea un numero. */
  projectSlug?: string;
  textQuery?: string;
  /** Las etiquetas del espacio: los menus guardan ids y el servidor casa nombres. */
  workspaceLabels?: ReadonlyArray<{ id: string; name: string }>;
};

/**
 * Los filtros del Tablero y la Lista: el estado de los menus (que se acuerda
 * por proyecto en este navegador) y el filtro del servidor que producen. La
 * vista pide ese filtro; ya no recorta nada en el cliente (ADR 065).
 */
export function useBoardFilters({
  projectId,
  projectSlug,
  textQuery = "",
  workspaceLabels,
}: Options) {
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const storageKey = projectId ? `riuna:board-filters:${projectId}` : null;
  // Se lee al crear el estado y no en un efecto: con un efecto de lectura y otro
  // de escritura en el mismo montaje, el segundo guardaba los valores por
  // defecto antes de que el primero los aplicara, y el filtro se perdia al
  // recargar (React lo ejecuta dos veces en desarrollo).
  const [stored, setStored] = useState(() => ({
    key: storageKey,
    filters: readFilters(storageKey),
  }));
  if (stored.key !== storageKey) {
    setStored({ key: storageKey, filters: readFilters(storageKey) });
  }
  const filters = stored.key === storageKey ? stored.filters : DEFAULT_FILTERS;
  const [debouncedText, setDebouncedText] = useState(textQuery);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  }, [filters, storageKey]);

  const setFilters = (update: (previous: BoardFilters) => BoardFilters) =>
    setStored((previous) => ({
      key: previous.key,
      filters: update(previous.filters),
    }));

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedText(textQuery),
      TEXT_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [textQuery]);

  const labelNames = useMemo(
    () => new Map((workspaceLabels ?? []).map((l) => [l.id, l.name])),
    [workspaceLabels],
  );

  // Las semanas son relativas a hoy: el filtro se recalcula con la pagina, no
  // con el reloj, y eso basta —cambiar de dia obliga a recargar o a tocar un menu.
  const filter = useMemo(
    () =>
      buildTaskViewFilter(filters, {
        text: debouncedText,
        projectSlug,
        weekStartsOn,
        labelNames,
      }),
    [filters, debouncedText, projectSlug, weekStartsOn, labelNames],
  );

  const hasActiveFilters = FILTER_KEYS.some(
    (key) => (filters[key]?.length ?? 0) > 0,
  );

  const clearFilters = () => setFilters(() => DEFAULT_FILTERS);

  const updateFilter = (
    key: keyof BoardFilters,
    value: BoardFilters[keyof BoardFilters],
  ) => setFilters((prev) => ({ ...prev, [key]: value }));

  const updateLabelFilter = (labelId: string) =>
    setFilters((prev) => {
      const current = prev.labels ?? [];
      const next = current.includes(labelId)
        ? current.filter((id) => id !== labelId)
        : [...current, labelId];
      return { ...prev, labels: next.length > 0 ? next : null };
    });

  return {
    filters,
    filter,
    updateFilter,
    updateLabelFilter,
    hasActiveFilters,
    clearFilters,
  };
}

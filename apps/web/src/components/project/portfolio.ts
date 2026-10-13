import type { TFunction } from "i18next";
import type { TableColumnOption } from "@/components/table-view/columns";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import { PROJECT_HEALTHS } from "@/lib/project-health";

/**
 * Las columnas de la cartera (ADR 088): el nombre, que no se oculta, las del
 * proyecto y una por campo de proyecto. `title` es el id que el selector de
 * columnas trata como obligatorio.
 */
export const PORTFOLIO_BASE_COLUMNS = [
  "title",
  "health",
  "lead",
  "startDate",
  "endDate",
  "progress",
  "tasks",
] as const;

export function portfolioColumns(
  definitions: FieldDefinition[],
  t: TFunction,
): TableColumnOption[] {
  return [
    ...PORTFOLIO_BASE_COLUMNS.map<TableColumnOption>((id) => ({
      id,
      label: t(`workspace:projects.columns.${id}`),
      kind: "base",
    })),
    ...definitions.map<TableColumnOption>((definition) => ({
      id: `custom.${definition.key}`,
      label: definition.name,
      kind: "custom",
    })),
  ];
}

export type PortfolioProject = {
  id: string;
  name: string;
  health?: string | null;
  leadUserId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  customFields?: Record<string, unknown> | null;
  statistics: { completionPercentage: number; totalTasks: number };
};

/** `endDate` sube, `-endDate` baja. */
export function parseSort(sort: string | undefined) {
  if (!sort) return null;
  const desc = sort.startsWith("-");
  return { id: desc ? sort.slice(1) : sort, desc };
}

export function nextSort(current: string | undefined, id: string) {
  const parsed = parseSort(current);
  if (!parsed || parsed.id !== id) return id;
  return parsed.desc ? undefined : `-${id}`;
}

type SortValue = string | number | null;

function sortValue(
  project: PortfolioProject,
  id: string,
  leadName: (userId: string) => string,
): SortValue {
  switch (id) {
    case "title":
      return project.name.toLocaleLowerCase();
    case "health":
      return PROJECT_HEALTHS.indexOf(
        (project.health ?? "not_started") as (typeof PROJECT_HEALTHS)[number],
      );
    case "lead":
      return project.leadUserId
        ? leadName(project.leadUserId).toLocaleLowerCase()
        : null;
    case "startDate":
      return project.startDate ? new Date(project.startDate).getTime() : null;
    case "endDate":
      return project.endDate ? new Date(project.endDate).getTime() : null;
    case "progress":
      return project.statistics.completionPercentage;
    case "tasks":
      return project.statistics.totalTasks;
    default: {
      if (!id.startsWith("custom.")) return null;
      const value = project.customFields?.[id.slice("custom.".length)];
      if (typeof value === "number") return value;
      if (typeof value === "string") return value.toLocaleLowerCase();
      if (typeof value === "boolean") return value ? 1 : 0;
      if (Array.isArray(value)) return value.join(",").toLocaleLowerCase();
      return null;
    }
  }
}

/**
 * Ordena la cartera por una columna. Lo vacio va al final en los dos sentidos,
 * como en la Tabla: un proyecto sin fecha no es el mas antiguo ni el ultimo.
 */
export function sortProjects<T extends PortfolioProject>(
  projects: T[],
  sort: string | undefined,
  leadName: (userId: string) => string,
): T[] {
  const parsed = parseSort(sort);
  if (!parsed) return projects;
  const direction = parsed.desc ? -1 : 1;
  return [...projects].sort((a, b) => {
    const left = sortValue(a, parsed.id, leadName);
    const right = sortValue(b, parsed.id, leadName);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (left < right) return -direction;
    if (left > right) return direction;
    return 0;
  });
}

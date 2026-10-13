import { eq } from "drizzle-orm";
import db from "../../database";
import { userTable, workspaceUserTable } from "../../database/schema";
import { getWorkspaceFieldDefinitions } from "../../field/controllers/get-field-definitions";
import {
  buildExchangeWorkbook,
  type ExchangeSheetColumn,
} from "../../task/exchange/build-file";
import type { FilterNode } from "../../view/filter-to-sql";
import getProjects from "./get-projects";

const HEALTH_LABELS: Record<string, string> = {
  not_started: "Sin empezar",
  on_track: "En plazo",
  at_risk: "En riesgo",
  off_track: "Desviado",
  finished: "Terminado",
  cancelled: "Cancelado",
};

type Option = { value: string; label: string };

/**
 * La cartera en Excel (ADR 088): los proyectos que casan con el filtro, con sus
 * columnas fijas y una por campo de proyecto, cada valor como se lee y no como
 * se guarda —la etiqueta de la opcion, el nombre de la persona—.
 */
async function exportProjects(workspaceId: string, filter: FilterNode | null) {
  const [projects, definitions, members] = await Promise.all([
    getProjects(workspaceId, false, filter),
    getWorkspaceFieldDefinitions(workspaceId, false, "project"),
    db
      .select({ id: userTable.id, name: userTable.name })
      .from(workspaceUserTable)
      .innerJoin(userTable, eq(workspaceUserTable.userId, userTable.id))
      .where(eq(workspaceUserTable.workspaceId, workspaceId)),
  ]);
  const nameOf = new Map(members.map((member) => [member.id, member.name]));

  const fieldValue = (
    definition: (typeof definitions)[number],
    value: unknown,
  ): string | number | Date | null => {
    if (value === null || value === undefined || value === "") return null;
    const options = (definition.config?.options ?? []) as Option[];
    const labelOf = (id: unknown) =>
      options.find((option) => option.value === id)?.label ?? String(id);
    switch (definition.type) {
      case "number":
      case "currency":
        return typeof value === "number" ? value : null;
      case "date":
        return typeof value === "string" ? new Date(`${value}T00:00:00`) : null;
      case "checkbox":
        return value === true ? "Sí" : "No";
      case "select":
        return labelOf(value);
      case "multi_select":
        return Array.isArray(value) ? value.map(labelOf).join(", ") : null;
      case "user":
        return nameOf.get(String(value)) ?? String(value);
      default:
        return String(value);
    }
  };

  const columns: ExchangeSheetColumn[] = [
    { header: "Proyecto", kind: "text", width: 32 },
    { header: "Clave", kind: "text", width: 10 },
    { header: "Estado", kind: "text", width: 14 },
    { header: "Nota", kind: "text", width: 40 },
    { header: "Responsable", kind: "text", width: 22 },
    { header: "Inicio", kind: "date", width: 12 },
    { header: "Fin", kind: "date", width: 12 },
    { header: "Progreso (%)", kind: "number", width: 12 },
    { header: "Tareas", kind: "number", width: 10 },
    ...definitions.map(
      (definition): ExchangeSheetColumn => ({
        header: definition.name,
        kind:
          definition.type === "number" || definition.type === "currency"
            ? "number"
            : definition.type === "date"
              ? "date"
              : "text",
      }),
    ),
  ];

  const rows = projects.map((project) => {
    const values = (project.customFields ?? {}) as Record<string, unknown>;
    return {
      cells: [
        project.name,
        project.slug,
        HEALTH_LABELS[project.health] ?? project.health,
        project.healthNote,
        project.leadUserId ? (nameOf.get(project.leadUserId) ?? null) : null,
        project.startDate,
        project.endDate,
        project.statistics.completionPercentage,
        project.statistics.totalTasks,
        ...definitions.map((definition) =>
          fieldValue(definition, values[definition.key]),
        ),
      ],
    };
  });

  const buffer = await buildExchangeWorkbook({
    sheetName: "Proyectos",
    columns,
    rows,
  });
  const day = new Date().toISOString().slice(0, 10);
  return { buffer, filename: `proyectos-${day}.xlsx` };
}

export default exportProjects;

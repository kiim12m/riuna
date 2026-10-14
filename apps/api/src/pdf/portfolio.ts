import { eq } from "drizzle-orm";
import db from "../database";
import { workspaceTable } from "../database/schema";
import { getWorkspaceFieldDefinitions } from "../field/controllers/get-field-definitions";
import { HEALTH_LABELS } from "../project/controllers/export-projects";
import getProjects from "../project/controllers/get-projects";
import type { FilterNode } from "../view/filter-to-sql";
import { memberNames } from "./context";
import { dataTable, type PdfColumn, pdfDocument } from "./document";
import { formatDay, formatFieldValue } from "./format";

const BASE_COLUMNS: Record<string, PdfColumn> = {
  title: { header: "Proyecto", width: "*" },
  health: { header: "Estado" },
  lead: { header: "Responsable" },
  startDate: { header: "Inicio", noWrap: true },
  endDate: { header: "Fin", noWrap: true },
  progress: { header: "Progreso", align: "right" },
  tasks: { header: "Tareas", align: "right" },
};

/**
 * La cartera en PDF (ADR 091), lo que la 3.2 dejo para cuando llegase: los
 * proyectos que casan con el filtro, con las columnas que se ven y cada
 * subproyecto bajo su padre (ADR 089).
 */
export async function buildPortfolioPdf(
  workspaceId: string,
  options: {
    filter: FilterNode | null;
    columns?: string[];
    title?: string;
    subtitle?: string;
  },
  author: string,
) {
  const [projects, definitions, names, workspace] = await Promise.all([
    getProjects(workspaceId, false, options.filter),
    getWorkspaceFieldDefinitions(workspaceId, false, "project"),
    memberNames(workspaceId),
    db
      .select({ name: workspaceTable.name })
      .from(workspaceTable)
      .where(eq(workspaceTable.id, workspaceId)),
  ]);
  const byKey = new Map(definitions.map((d) => [d.key, d]));

  const ids = (
    options.columns?.length
      ? options.columns
      : [
          ...Object.keys(BASE_COLUMNS),
          ...definitions.map((d) => `custom.${d.key}`),
        ]
  ).filter(
    (id, index, all) =>
      all.indexOf(id) === index &&
      (id in BASE_COLUMNS || byKey.has(id.replace(/^custom\./, ""))),
  );
  if (!ids.includes("title")) ids.unshift("title");

  // Cada padre seguido de sus hijos; un hijo cuyo padre dejo fuera el filtro
  // sale suelto, como en la lista.
  const shown = new Set(projects.map((project) => project.id));
  const roots = projects.filter(
    (project) => !project.parentId || !shown.has(project.parentId),
  );
  const ordered = roots.flatMap((root) => [
    { project: root, child: false },
    ...projects
      .filter((project) => project.parentId === root.id)
      .map((project) => ({ project, child: true })),
  ]);

  type Project = (typeof projects)[number];
  const cellOf = (project: Project, child: boolean, id: string) => {
    switch (id) {
      case "title":
        return `${child ? "   " : ""}${project.name} (${project.slug.toUpperCase()})`;
      case "health":
        return HEALTH_LABELS[project.health] ?? project.health;
      case "lead":
        return project.leadUserId ? (names.get(project.leadUserId) ?? "") : "";
      case "startDate":
        return formatDay(project.startDate);
      case "endDate":
        return formatDay(project.endDate);
      case "progress":
        return `${project.statistics.completionPercentage} %`;
      case "tasks":
        return String(project.statistics.totalTasks);
    }
    const definition = byKey.get(id.replace(/^custom\./, ""));
    if (!definition) return "";
    const values = (project.customFields ?? {}) as Record<string, unknown>;
    return formatFieldValue(definition, values[definition.key], (userId) =>
      names.get(userId),
    );
  };

  const columns = ids.map(
    (id): PdfColumn =>
      BASE_COLUMNS[id] ?? {
        header: byKey.get(id.replace(/^custom\./, ""))?.name ?? id,
        align: ["number", "currency"].includes(
          byKey.get(id.replace(/^custom\./, ""))?.type ?? "",
        )
          ? "right"
          : "left",
      },
  );

  const count = `${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}`;
  const document = pdfDocument({
    context: workspace[0]?.name ?? "",
    author,
    title: options.title?.trim() || "Proyectos",
    subtitle: [options.subtitle?.trim(), count].filter(Boolean).join(" · "),
    landscape: columns.length > 5,
    content: [
      dataTable({
        columns,
        rows: ordered.map(({ project, child }) =>
          ids.map((id) => cellOf(project, child, id)),
        ),
      }),
    ],
  });

  return {
    document,
    filename: `proyectos-${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}

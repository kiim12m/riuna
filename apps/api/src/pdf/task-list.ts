import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { columnTable } from "../database/schema";
import { getFieldDefinitionsForProject } from "../field/controllers/get-field-definitions";
import getTasks from "../task/controllers/get-tasks";
import { PRIORITY_LABELS } from "../task/exchange/format";
import {
  assignOutlineNumbers,
  compareOutline,
} from "../task/exchange/outline-numbers";
import type { FilterNode } from "../view/filter-to-sql";
import { memberNames, projectContext, taskKey } from "./context";
import { dataTable, type PdfColumn, pdfDocument } from "./document";
import {
  fileSafe,
  formatDay,
  formatFieldValue,
  formatHours,
  formatMoney,
  formatNumber,
} from "./format";

/**
 * Un PDF no es una hoja de calculo: con miles de filas son cientos de paginas
 * que nadie imprime, y maquetarlas tarda. El Excel sigue llegando a 20.000.
 */
const MAX_PDF_ROWS = 5_000;

/** Las columnas de la Tabla que no son de un campo, en su orden. */
const BASE_COLUMNS: Record<string, PdfColumn> = {
  title: { header: "Título", width: "*" },
  status: { header: "Estado" },
  priority: { header: "Prioridad" },
  assignee: { header: "Asignado" },
  startDate: { header: "Inicio", noWrap: true },
  dueDate: { header: "Vence", noWrap: true },
  estimate: { header: "Estimado", align: "right" },
  "agg.progress": { header: "Progreso", align: "right" },
  "agg.descendants": { header: "Subtareas", align: "right" },
  "agg.estimate": { header: "Estimado (rama)", align: "right" },
};

/** Lo que sale si quien exporta no viene de la Tabla, que elige las suyas. */
export const DEFAULT_PDF_COLUMNS = [
  "title",
  "status",
  "assignee",
  "dueDate",
  "estimate",
];

type ListOptions = {
  filter?: FilterNode | null;
  treeScope?: "matching" | "roots" | "withDescendants";
  /** Los ids de columna de la Tabla (`custom.<clave>`, `agg.sum.<clave>`...). */
  columns?: string[];
  /** El nombre de la vista y el filtro en palabras, como los ve quien exporta. */
  title?: string;
  subtitle?: string;
};

/**
 * Cualquier vista de un proyecto en PDF (ADR 091): la misma busqueda que la
 * exportacion a Excel —el filtro de la URL—, con las columnas que se ven y una
 * fila de totales en la que cada tarea cuenta una vez, como la de la Tabla.
 */
export async function buildTaskListPdf(
  projectId: string,
  options: ListOptions,
  author: string,
) {
  const project = await projectContext(projectId);
  const [{ data }, definitions, names, statuses] = await Promise.all([
    getTasks(projectId, {
      filter: options.filter ?? null,
      treeScope: options.treeScope,
    }),
    getFieldDefinitionsForProject(project.workspaceId, projectId),
    memberNames(project.workspaceId),
    db
      .select({ slug: columnTable.slug, name: columnTable.name })
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId))
      .orderBy(asc(columnTable.position)),
  ]);

  const tasks = [
    ...data.columns.flatMap((column) => column.tasks),
    ...data.archivedTasks,
    ...data.plannedTasks,
  ];
  if (tasks.length > MAX_PDF_ROWS) {
    throw new HTTPException(400, {
      message: `The PDF would have ${tasks.length} rows and the limit is ${MAX_PDF_ROWS}: narrow the filter or export to Excel`,
    });
  }

  const outline = assignOutlineNumbers(tasks);
  const ordered = [...tasks].sort((left, right) =>
    compareOutline(outline.get(left.id) ?? "", outline.get(right.id) ?? ""),
  );
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  const statusName = new Map(statuses.map((s) => [s.slug, s.name]));
  const nameOf = (id: string) => names.get(id);

  // Solo las columnas que se conocen: una vista guardada puede nombrar un
  // campo que despues se borro.
  const ids = (options.columns?.length ? options.columns : DEFAULT_PDF_COLUMNS)
    .filter(
      (id) =>
        id in BASE_COLUMNS ||
        byKey.has(id.replace(/^custom\./, "").replace(/^agg\.sum\./, "")),
    )
    .filter((id, index, all) => all.indexOf(id) === index);
  if (!ids.includes("title")) ids.unshift("title");

  const definitionOf = (id: string) =>
    byKey.get(id.replace(/^custom\./, "").replace(/^agg\.sum\./, ""));

  const columns: PdfColumn[] = [
    { header: "ID", noWrap: true },
    ...ids.map((id): PdfColumn => {
      const base = BASE_COLUMNS[id];
      if (base) return base;
      const definition = definitionOf(id);
      const numeric = ["number", "currency", "formula"].includes(
        definition?.type ?? "",
      );
      const name = definition?.name ?? id;
      return {
        header: id.startsWith("agg.sum.")
          ? `Σ ${name}`
          : definition?.type === "formula"
            ? `ƒ ${name}`
            : name,
        align: numeric || id.startsWith("agg.sum.") ? "right" : "left",
      };
    }),
  ];

  type Row = (typeof ordered)[number];
  const cellOf = (task: Row, id: string): string => {
    const values = (task.customFields ?? {}) as Record<string, unknown>;
    switch (id) {
      case "title":
        return `${"   ".repeat(task.depth ?? 0)}${task.title}`;
      case "status":
        return statusName.get(task.status) ?? task.status;
      case "priority":
        return PRIORITY_LABELS[task.priority ?? ""] ?? task.priority ?? "";
      case "assignee":
        return task.assignees.map((person) => person.name).join(", ");
      case "startDate":
        return formatDay(task.startDate);
      case "dueDate":
        return formatDay(task.dueDate);
      case "estimate":
        return formatHours(task.estimate);
      case "agg.progress":
        return task.subtree ? `${task.subtree.progress} %` : "";
      case "agg.descendants":
        return task.subtree ? String(task.subtree.descendantCount) : "";
      case "agg.estimate":
        return formatHours(task.subtree?.estimateSeconds ?? task.estimate);
    }
    const definition = definitionOf(id);
    if (!definition) return "";
    if (id.startsWith("agg.sum.")) {
      const sum = task.subtree?.fieldSums?.[definition.key];
      return formatFieldValue(
        definition,
        sum ?? values[definition.key],
        nameOf,
      );
    }
    return formatFieldValue(definition, values[definition.key], nameOf);
  };

  // Cada tarea una vez, con lo suyo y no con lo de su rama: sumar ramas contaria
  // dos veces a cada hija. Los calculados no se suman (ADR 090).
  const totalOf = (id: string): string => {
    if (id === "estimate" || id === "agg.estimate") {
      return formatHours(
        ordered.reduce((sum, task) => sum + (task.estimate ?? 0), 0),
      );
    }
    const definition = definitionOf(id);
    if (!definition || !["number", "currency"].includes(definition.type)) {
      return "";
    }
    const sum = ordered.reduce((total, task) => {
      const value = (task.customFields as Record<string, unknown> | null)?.[
        definition.key
      ];
      return total + (typeof value === "number" ? value : 0);
    }, 0);
    return definition.type === "currency"
      ? formatMoney(
          sum,
          typeof definition.config?.currency === "string"
            ? definition.config.currency
            : "EUR",
        )
      : formatNumber(sum);
  };

  const count = `${ordered.length} ${ordered.length === 1 ? "tarea" : "tareas"}`;
  const document = pdfDocument({
    context: project.context,
    author,
    title: options.title?.trim() || `${project.name} · Tareas`,
    subtitle: [options.subtitle?.trim(), count].filter(Boolean).join(" · "),
    landscape: columns.length > 6,
    content: [
      dataTable({
        columns,
        rows: ordered.map((task) => [
          taskKey(project.slug, task.number),
          ...ids.map((id) => cellOf(task, id)),
        ]),
        totals: [
          "Total",
          ...ids.map((id) => (id === "title" ? count : totalOf(id))),
        ],
      }),
    ],
  });

  return {
    document,
    filename: `tareas-${fileSafe(project.slug)}-${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}

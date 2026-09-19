import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskAssigneeTable, userTable } from "../../database/schema";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import type { FieldType } from "../../field/field-types";
import { richTextToPlainText } from "../../utils/rich-text-to-plain-text";
import type { FilterNode } from "../../view/filter-to-sql";
import {
  buildExchangeCsv,
  buildExchangeWorkbook,
  type ExchangeSheet,
  type ExchangeSheetColumn,
  type ExchangeSheetRow,
} from "../exchange/build-file";
import {
  EXCHANGE_COLUMNS,
  type ExchangeField,
  formatList,
  matchHeader,
  PRIORITY_LABELS,
} from "../exchange/format";
import { assignOutlineNumbers } from "../exchange/outline-numbers";
import { formatSheetDateIso } from "../exchange/sheet-dates";
import getTasks from "./get-tasks";

// Exportacion al formato de intercambio (ADR 017). Sale de `getTasks`, que es
// quien sabe de filtros, para que "exportar la vista que estoy mirando" sea
// pasarle la misma busqueda que ya vive en la URL —punto 3 de la ADR 015— en
// vez de portar el compilador de filtros al servidor.

/** Una exportacion no pagina, asi que necesita un techo. El mismo que SERVITEC. */
const MAX_ROWS = 20_000;

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type SheetFormat = "csv" | "xlsx";

export type ExportedSheet = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

async function exportTaskSheet(
  projectId: string,
  options: {
    format: SheetFormat;
    filter?: FilterNode | null;
    treeScope?: "matching" | "roots" | "withDescendants";
  },
): Promise<ExportedSheet> {
  const { data: project } = await getTasks(projectId, {
    filter: options.filter ?? null,
    treeScope: options.treeScope,
  });

  const tasks = [
    ...project.columns.flatMap((column) => column.tasks),
    ...project.archivedTasks,
    ...project.plannedTasks,
  ];

  if (tasks.length > MAX_ROWS) {
    throw new HTTPException(400, {
      message: `The export would have ${tasks.length} rows and the limit is ${MAX_ROWS}`,
    });
  }

  const outlineById = assignOutlineNumbers(tasks);
  const ordered = [...tasks].sort((left, right) =>
    compareOutline(
      outlineById.get(left.id) ?? "",
      outlineById.get(right.id) ?? "",
    ),
  );

  const assigneesByTask = await loadAssignees(tasks.map((task) => task.id));
  const definitions = await getFieldDefinitionsForProject(
    project.workspaceId,
    projectId,
  );

  const statusNameBySlug = new Map(
    project.columns.map((column) => [column.slug, column.name]),
  );

  const columns: ExchangeSheetColumn[] = [
    ...EXCHANGE_COLUMNS.map(
      (column): ExchangeSheetColumn => ({
        header: column.header,
        kind:
          column.field === "startDate" || column.field === "dueDate"
            ? "date"
            : column.field === "estimateHours"
              ? "number"
              : "text",
        hidden: column.hidden,
        width: column.field === "title" ? 44 : undefined,
      }),
    ),
    ...definitions.map(
      (definition): ExchangeSheetColumn => ({
        header: customHeader(definition.name),
        kind: customKind(definition.type as FieldType),
      }),
    ),
  ];

  const rows: ExchangeSheetRow[] = ordered.map((task) => {
    const outline = outlineById.get(task.id) ?? "";
    const assignees = assigneesByTask.get(task.id) ?? [];
    const primaryEmail =
      assignees.find((entry) => entry.userId === task.userId)?.email ?? "";

    // Por campo y no por posicion: el orden de las columnas lo decide
    // `EXCHANGE_COLUMNS`, y una lista posicional escribiria valores en la
    // columna equivocada —en silencio— en cuanto alguien reordenase aquella.
    const byField: Record<ExchangeField, string | number | Date | null> = {
      id: task.id,
      key: `${project.slug}-${task.number ?? ""}`,
      // La referencia externa es del fichero ajeno, no de Riuna: se exporta
      // vacia para que el viaje de ida y vuelta se identifique por `ID`.
      reference: "",
      outline,
      title: task.title,
      description: richTextToPlainText(task.description ?? ""),
      descriptionHtml: task.description ?? "",
      status: statusNameBySlug.get(task.status) ?? task.status,
      priority: PRIORITY_LABELS[task.priority] ?? task.priority,
      // Por su correo: es lo que el importador casa primero, y a diferencia del
      // nombre no se repite entre dos personas.
      assignee: primaryEmail,
      assignees: formatList(assignees.map((entry) => entry.email)),
      team: task.teamName ?? "",
      epics: formatList(task.epics.map((epic) => epic.name)),
      labels: formatList(task.labels.map((label) => label.name)),
      startDate: task.startDate,
      dueDate: task.dueDate,
      estimateHours: task.estimate == null ? null : task.estimate / 3600,
    };

    const cells: Array<string | number | Date | null> = EXCHANGE_COLUMNS.map(
      (column) => byField[column.field],
    );

    for (const definition of definitions) {
      cells.push(
        formatCustomValue(
          definition.type as FieldType,
          (task.customFields as Record<string, unknown>)?.[definition.key],
        ),
      );
    }

    return {
      cells,
      outlineLevel: Math.max(outline.split(".").length - 1, 0),
    };
  });

  const sheet: ExchangeSheet = {
    sheetName: "Tareas",
    columns,
    rows,
    // La columna del titulo, para que el arbol se lea sangrado.
    indentColumn:
      EXCHANGE_COLUMNS.findIndex((column) => column.field === "title") + 1,
  };

  const stamp = formatSheetDateIso(new Date());

  if (options.format === "csv") {
    return {
      buffer: buildExchangeCsv(sheet),
      filename: `tareas-${project.slug}-${stamp}.csv`,
      contentType: "text/csv; charset=utf-8",
    };
  }

  return {
    buffer: await buildExchangeWorkbook(sheet),
    filename: `tareas-${project.slug}-${stamp}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
  };
}

/** Orden de recorrido del arbol: `1.2` antes que `1.10`, y `1.10` antes que `2`. */
function compareOutline(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);

  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

/** Los asignados de cada tarea con su correo, en una sola consulta. */
async function loadAssignees(taskIds: string[]) {
  const byTask = new Map<string, Array<{ userId: string; email: string }>>();

  if (taskIds.length === 0) {
    return byTask;
  }

  const rows = await db
    .select({
      taskId: taskAssigneeTable.taskId,
      userId: taskAssigneeTable.userId,
      email: userTable.email,
    })
    .from(taskAssigneeTable)
    .innerJoin(userTable, eq(taskAssigneeTable.userId, userTable.id))
    .where(inArray(taskAssigneeTable.taskId, taskIds));

  for (const row of rows) {
    const entry = byTask.get(row.taskId);
    if (entry) entry.push({ userId: row.userId, email: row.email });
    else byTask.set(row.taskId, [{ userId: row.userId, email: row.email }]);
  }

  return byTask;
}

/**
 * Un campo personalizado llamado igual que una columna reservada —«Estado»,
 * «Equipo»— produciria dos cabeceras iguales, y al reimportar ganaria la
 * reservada, perdiendo el valor del campo. Se desambigua en el nombre.
 */
function customHeader(name: string): string {
  return matchHeader(name).kind === "reserved" ? `${name} (campo)` : name;
}

function customKind(type: FieldType): ExchangeSheetColumn["kind"] {
  if (type === "date") return "date";
  if (type === "number" || type === "currency") return "number";
  return "text";
}

function formatCustomValue(
  type: FieldType,
  value: unknown,
): string | number | Date | null {
  if (value === null || value === undefined) return null;

  if (type === "checkbox") return value ? "Sí" : "No";
  if (type === "multi_select") {
    return Array.isArray(value) ? formatList(value.map(String)) : String(value);
  }
  if (type === "number" || type === "currency") {
    return typeof value === "number" ? value : null;
  }

  return String(value);
}

export default exportTaskSheet;

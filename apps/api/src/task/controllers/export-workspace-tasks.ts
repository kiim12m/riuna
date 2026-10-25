import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  columnTable,
  projectTable,
  taskTable,
  timeEntryTable,
  workspaceTable,
} from "../../database/schema";
import { richTextToPlainText } from "../../utils/rich-text-to-plain-text";
import { formatSheetDateIso } from "../exchange/sheet-dates";
import {
  buildServitecWorkbook,
  type ServitecComment,
  type ServitecEstado,
  type ServitecRow,
} from "../exports/servitec-workbook";

// An export cannot paginate, so it needs a ceiling instead. Well above any
// realistic board, and low enough that one request cannot exhaust memory.
const MAX_ROWS = 20_000;

// Sentinel statuses that live in `task.status` instead of naming a column.
const ARCHIVED = "archived";
const PLANNED = "planned";

type ColumnMeta = { isFinal: boolean; position: number };

export function resolveEstado(
  status: string,
  column: ColumnMeta | undefined,
): ServitecEstado {
  // Archiving replaces the status in Riuna, so it wins over everything else.
  if (status === ARCHIVED) return ".Realizado";
  if (status === PLANNED) return "Pendiente";
  if (!column) return "Pendiente";
  if (column.isFinal) return "Realizado";
  if (column.position === 0) return "Pendiente";
  return "En curso";
}

/**
 * Cuando se trabajo por ultima vez en cada tarea del espacio: el comentario mas
 * reciente o la entrada de tiempo mas reciente, la que sea (ADR 094). Un
 * cronometro en marcha cuenta por su arranque; uno cerrado, por su cierre.
 *
 * No sale de `task.updated_at`, que tambien se mueve cuando nadie ha trabajado:
 * reimportar la hoja reescribe todas las filas que ya existian, y recalcular
 * fechas automaticas o propagar un estado tocan tareas que nadie ha abierto.
 *
 * Va por join con el espacio y no con `inArray(taskIds)`: son hasta 20.000 ids.
 */
async function lastWorkedAt(workspaceId: string) {
  const inWorkspace = and(
    eq(projectTable.workspaceId, workspaceId),
    isNull(projectTable.archivedAt),
  );

  const [comments, entries] = await Promise.all([
    db
      .select({
        taskId: activityTable.taskId,
        at: max(activityTable.createdAt),
      })
      .from(activityTable)
      .innerJoin(taskTable, eq(activityTable.taskId, taskTable.id))
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(and(inWorkspace, eq(activityTable.type, "comment")))
      .groupBy(activityTable.taskId),
    db
      .select({
        taskId: timeEntryTable.taskId,
        // `mapWith` para que llegue como `Date`: un `max(coalesce(...))` suelto
        // lo devolveria como texto.
        at: sql<Date | null>`max(coalesce(${timeEntryTable.endTime}, ${timeEntryTable.startTime}))`.mapWith(
          timeEntryTable.endTime,
        ),
      })
      .from(timeEntryTable)
      .innerJoin(taskTable, eq(timeEntryTable.taskId, taskTable.id))
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(inWorkspace)
      .groupBy(timeEntryTable.taskId),
  ]);

  const latest = new Map<string, Date>();
  for (const { taskId, at } of [...comments, ...entries]) {
    const current = latest.get(taskId);
    if (at && (!current || at > current)) latest.set(taskId, at);
  }
  return latest;
}

function latestOf(base: Date, other: Date | undefined) {
  return other && other > base ? other : base;
}

async function exportWorkspaceTasks(workspaceId: string) {
  const workspace = await db.query.workspaceTable.findFirst({
    where: eq(workspaceTable.id, workspaceId),
  });

  if (!workspace) {
    throw new HTTPException(404, { message: "Workspace not found" });
  }

  const tasks = await db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      createdAt: taskTable.createdAt,
      projectId: taskTable.projectId,
      projectName: projectTable.name,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
      ),
    )
    .orderBy(
      asc(taskTable.createdAt),
      asc(projectTable.name),
      asc(taskTable.number),
    )
    .limit(MAX_ROWS + 1);

  if (tasks.length > MAX_ROWS) {
    throw new HTTPException(400, {
      message: `This workspace has more than ${MAX_ROWS} tasks, which is too many for a single spreadsheet. Archive old projects or export a project at a time.`,
    });
  }

  const projectIds = [...new Set(tasks.map((task) => task.projectId))];

  const columns =
    projectIds.length > 0
      ? await db
          .select({
            projectId: columnTable.projectId,
            slug: columnTable.slug,
            isFinal: columnTable.isFinal,
            position: columnTable.position,
          })
          .from(columnTable)
          .where(inArray(columnTable.projectId, projectIds))
      : [];

  const columnsByProjectAndSlug = new Map<string, ColumnMeta>();
  for (const column of columns) {
    columnsByProjectAndSlug.set(`${column.projectId}:${column.slug}`, {
      isFinal: column.isFinal,
      position: column.position,
    });
  }

  const taskIds = tasks.map((task) => task.id);
  const workedAt = await lastWorkedAt(workspaceId);

  // Los comentarios viven en `activity` con `type = 'comment'`, no en la tabla
  // `comment` heredada de Kaneo, que la aplicacion no escribe desde ninguna
  // parte. Leer de `comment` dejaba la columna «Comentario» siempre vacia.
  const comments =
    taskIds.length > 0
      ? await db
          .select({
            taskId: activityTable.taskId,
            content: activityTable.content,
            createdAt: activityTable.createdAt,
          })
          .from(activityTable)
          .where(
            and(
              inArray(activityTable.taskId, taskIds),
              eq(activityTable.type, "comment"),
            ),
          )
          .orderBy(asc(activityTable.createdAt))
      : [];

  const commentsByTask = new Map<string, ServitecComment[]>();
  for (const comment of comments) {
    const text = richTextToPlainText(comment.content);
    if (!text) continue;
    const entry = { fecha: comment.createdAt, texto: text };
    const existing = commentsByTask.get(comment.taskId);
    if (existing) {
      existing.push(entry);
    } else {
      commentsByTask.set(comment.taskId, [entry]);
    }
  }

  const rows: ServitecRow[] = tasks.map((task) => ({
    id: task.id,
    fecha: task.createdAt,
    // La fecha de alta es el suelo: una tarea en la que nadie ha trabajado
    // muestra desde cuando existe.
    fechaActualizacion: latestOf(task.createdAt, workedAt.get(task.id)),
    concepto: task.title,
    proyecto: task.projectName,
    estado: resolveEstado(
      task.status,
      columnsByProjectAndSlug.get(`${task.projectId}:${task.status}`),
    ),
    comentarios: commentsByTask.get(task.id) ?? [],
  }));

  const buffer = await buildServitecWorkbook(rows);

  return {
    buffer,
    filename: `tareas-${workspace.slug}-${formatSheetDateIso(new Date())}.xlsx`,
  };
}

export default exportWorkspaceTasks;

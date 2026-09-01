import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  commentTable,
  projectTable,
  taskTable,
  workspaceTable,
} from "../../database/schema";
import { richTextToPlainText } from "../../utils/rich-text-to-plain-text";
import { formatSheetDate, formatSheetDateIso } from "../exchange/sheet-dates";
import {
  buildServitecWorkbook,
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
      updatedAt: taskTable.updatedAt,
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

  const comments =
    taskIds.length > 0
      ? await db
          .select({
            taskId: commentTable.taskId,
            content: commentTable.content,
            createdAt: commentTable.createdAt,
          })
          .from(commentTable)
          .where(inArray(commentTable.taskId, taskIds))
          .orderBy(asc(commentTable.createdAt))
      : [];

  const commentsByTask = new Map<string, string[]>();
  for (const comment of comments) {
    const text = richTextToPlainText(comment.content);
    if (!text) continue;
    const entry = `${formatSheetDate(comment.createdAt)} — ${text}`;
    const existing = commentsByTask.get(comment.taskId);
    if (existing) {
      existing.push(entry);
    } else {
      commentsByTask.set(comment.taskId, [entry]);
    }
  }

  const rows: ServitecRow[] = tasks.map((task) => ({
    fecha: task.createdAt,
    fechaActualizacion: task.updatedAt,
    concepto: task.title,
    proyecto: task.projectName,
    estado: resolveEstado(
      task.status,
      columnsByProjectAndSlug.get(`${task.projectId}:${task.status}`),
    ),
    // A blank line between comments, so a cell with several of them still reads
    // as separate entries once Excel wraps it.
    comentario: (commentsByTask.get(task.id) ?? []).join("\n\n"),
  }));

  const buffer = await buildServitecWorkbook(rows);

  return {
    buffer,
    filename: `tareas-${workspace.slug}-${formatSheetDateIso(new Date())}.xlsx`,
  };
}

export default exportWorkspaceTasks;

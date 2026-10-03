import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, labelTable, projectTable } from "../../database/schema";
import assignLabelToTask from "../../label/controllers/assign-label-to-task";
import setPlanEntry from "../../planner/controllers/set-plan-entry";
import createTask from "../../task/controllers/create-task";
import { parseServerDay } from "../../utils/day-boundaries";
import { ensureInbox } from "../inbox";

export type CaptureInput = {
  workspaceId: string;
  userId: string;
  title: string;
  /** Ausente: la Bandeja de quien captura, creada si hace falta (ADR 051). */
  projectId?: string;
  priority?: string;
  /** Segundos, como `task.estimate`. */
  estimate?: number;
  /** `yyyy-mm-dd`: vencimiento. */
  dueDate?: string;
  /** `yyyy-mm-dd`: el dia del plan personal, nunca el vencimiento. */
  plannedDate?: string;
  startMinute?: number;
  /** Etiquetas del espacio, no las copias que cuelgan de otra tarea. */
  labelIds?: string[];
};

async function resolveProject(
  workspaceId: string,
  userId: string,
  projectId: string | undefined,
) {
  if (!projectId) return ensureInbox(workspaceId, userId);

  const [project] = await db
    .select()
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    );

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return project;
}

/** La primera columna sin terminar: un proyecto puede no tener `to-do`. */
async function initialStatus(projectId: string) {
  const [column] = await db
    .select({ slug: columnTable.slug })
    .from(columnTable)
    .where(
      and(eq(columnTable.projectId, projectId), eq(columnTable.isFinal, false)),
    )
    .orderBy(asc(columnTable.position))
    .limit(1);

  return column?.slug ?? "to-do";
}

async function assertWorkspaceLabels(workspaceId: string, labelIds: string[]) {
  if (labelIds.length === 0) return;

  const found = await db
    .select({ id: labelTable.id })
    .from(labelTable)
    .where(
      and(
        inArray(labelTable.id, labelIds),
        eq(labelTable.workspaceId, workspaceId),
        // Una copia ya colgada de otra tarea se *moveria* al asignarla
        // (`assignLabelToTask`), quitandosela a aquella.
        isNull(labelTable.taskId),
      ),
    );

  if (found.length !== labelIds.length) {
    throw new HTTPException(400, { message: "Unknown label" });
  }
}

/**
 * Captura rapida (ADR 052): una tarea asignada a quien la captura, en la
 * Bandeja salvo que diga otro proyecto, y opcionalmente planificada,
 * estimada, con vencimiento, prioridad y etiquetas.
 *
 * El dia del plan va a `personal_plan_entry` y **nunca** a `due_date`
 * (ADR 040): son dos preguntas distintas, "cuando lo hago" y "para cuando
 * tiene que estar". Todo se valida antes de crear nada, para que un dato malo
 * no deje una tarea a medias.
 */
export default async function captureTask(input: CaptureInput) {
  const { workspaceId, userId } = input;
  const title = input.title.trim();
  if (title === "") {
    throw new HTTPException(400, { message: "Title is required" });
  }

  if (input.startMinute !== undefined && input.plannedDate === undefined) {
    throw new HTTPException(400, {
      message: "startMinute needs a plannedDate",
    });
  }

  const plannedDate =
    input.plannedDate !== undefined
      ? parseServerDay(input.plannedDate, "plannedDate")
      : undefined;
  const dueDate =
    input.dueDate !== undefined
      ? parseServerDay(input.dueDate, "dueDate")
      : undefined;
  const labelIds = [...new Set(input.labelIds ?? [])];
  await assertWorkspaceLabels(workspaceId, labelIds);

  const project = await resolveProject(workspaceId, userId, input.projectId);
  if (!project) {
    throw new HTTPException(500, { message: "Inbox not available" });
  }

  const task = await createTask({
    projectId: project.id,
    currentUserId: userId,
    userId,
    title,
    status: await initialStatus(project.id),
    dueDate,
    priority: input.priority,
    estimate: input.estimate ?? null,
  });

  if (plannedDate) {
    await setPlanEntry({
      workspaceId,
      userId,
      taskId: task.id,
      plannedDate,
      ...(input.startMinute !== undefined
        ? { startMinute: input.startMinute }
        : {}),
    });
  }

  for (const labelId of labelIds) {
    await assignLabelToTask(labelId, task.id, userId);
  }

  return {
    task,
    projectSlug: project.slug,
    inInbox: project.ownerUserId === userId,
  };
}

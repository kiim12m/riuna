import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { loadWorkCalendar } from "../../task/schedule/work-calendar";
import { projectScheduleWarning } from "../schedule-warning";

async function getProject(id: string, workspaceId: string) {
  const project = await db.query.projectTable.findFirst({
    where: and(
      eq(projectTable.id, id),
      eq(projectTable.workspaceId, workspaceId),
    ),
    with: {
      tasks: true,
    },
  });

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  // El aviso de desviacion de la cabecera (ADR 087), con las tareas que esta
  // lectura ya trae.
  let latestDueDate: Date | null = null;
  for (const task of project.tasks) {
    if (task.status === "archived" || !task.dueDate) continue;
    if (!latestDueDate || task.dueDate > latestDueDate) {
      latestDueDate = task.dueDate;
    }
  }
  const schedule =
    project.endDate && latestDueDate && latestDueDate > project.endDate
      ? projectScheduleWarning(
          project.endDate,
          latestDueDate,
          await loadWorkCalendar(workspaceId),
        )
      : null;

  return { ...project, schedule };
}

export default getProject;

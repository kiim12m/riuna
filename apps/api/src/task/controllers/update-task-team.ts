import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, teamTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { assertAssignableTeam } from "../../utils/assert-assignable-team";
import { getProjectWorkspaceId } from "../../utils/assert-assignable-user";

async function updateTaskTeam({
  id,
  teamId,
  currentUserId,
}: {
  id: string;
  teamId: string | null;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  const nextTeamId = teamId?.trim() || null;
  if (existingTask.teamId === nextTeamId) {
    return existingTask;
  }

  if (nextTeamId) {
    await assertAssignableTeam(
      nextTeamId,
      await getProjectWorkspaceId(existingTask.projectId),
    );
  }

  const [updatedTask] = await db
    .update(taskTable)
    .set({ teamId: nextTeamId })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task team",
    });
  }

  if (!nextTeamId) {
    await publishEvent("task.team_unassigned", {
      taskId: updatedTask.id,
      projectId: updatedTask.projectId,
      userId: currentUserId,
      // El departamento que deja de tenerla: es lo unico que permite avisar a
      // sus miembros de que la fila ya no les toca.
      oldTeamId: existingTask.teamId,
      title: updatedTask.title,
      type: "team_unassigned",
    });

    return updatedTask;
  }

  const newTeamName = (
    await db
      .select({ name: teamTable.name })
      .from(teamTable)
      .where(eq(teamTable.id, nextTeamId))
      .limit(1)
  )[0]?.name;

  await publishEvent("task.team_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    oldTeamId: existingTask.teamId,
    newTeam: newTeamName,
    newTeamId: nextTeamId,
    title: updatedTask.title,
    type: "team_changed",
  });

  return updatedTask;
}

export default updateTaskTeam;

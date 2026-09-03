import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../database";
import {
  projectTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";

// Todas las relaciones cuyos dos extremos siguen dentro del proyecto. El Gantt
// las dibuja como conectores sobre barras que ya tiene en pantalla, asi que solo
// necesita los ids y el tipo. Se exige que ambos extremos esten en el proyecto
// —no solo el origen— para no pintar una flecha a una tarea que se movio fuera.
//
// Sin paginar a proposito: el numero de relaciones de un proyecto es de otro
// orden que el de tareas. Si algun dia deja de serlo, este es el sitio de acotar.
async function getProjectTaskRelations(projectId: string, workspaceId: string) {
  const targetTask = alias(taskTable, "target_task");

  return db
    .select({
      id: taskRelationTable.id,
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
      relationType: taskRelationTable.relationType,
    })
    .from(taskRelationTable)
    .innerJoin(taskTable, eq(taskRelationTable.sourceTaskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .innerJoin(targetTask, eq(taskRelationTable.targetTaskId, targetTask.id))
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(targetTask.projectId, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    );
}

export default getProjectTaskRelations;

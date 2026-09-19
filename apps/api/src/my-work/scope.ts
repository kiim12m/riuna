import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import db from "../database";
import {
  taskAssigneeTable,
  taskTable,
  teamMemberTable,
  teamTable,
} from "../database/schema";

export type PersonalScope = "assigned" | "team";

/**
 * "Asignadas a mi", con la valla de optimizacion que la hace rapida.
 *
 * **El `OFFSET 0` no es un descuido: no lo quites.** Sin el, Postgres convierte
 * esto en un semi-join y decide recorrer todas las tareas del espacio sondeando
 * `task_assignee` una por una, porque estima mal cuantas sobreviven. Con la
 * valla no puede subir la subconsulta y arranca por `taskAssignee_userId_idx`,
 * que es el orden correcto: el trabajo pasa a ser proporcional a **tus** tareas
 * y no a las del espacio entero.
 *
 * Medido en la Fase 6 con 50.000 tareas y 5.062 asignadas a una persona:
 * 197 ms sin la valla, 47 ms con ella, y plano en la pagina 20.
 *
 * Vive aqui y no dentro de `get-my-work.ts` porque desde la Fase 7 lo usan dos
 * lecturas: la pagina y los widgets del panel. Copiarlo era pedir que una de
 * las dos perdiera la valla en el proximo cambio.
 */
export function assignedCondition(userId: string): SQL {
  return sql`${taskTable.id} IN (
    SELECT ${taskAssigneeTable.taskId} FROM ${taskAssigneeTable}
    WHERE ${taskAssigneeTable.userId} = ${userId}
    OFFSET 0
  )`;
}

/**
 * Los equipos a los que pertenece alguien, resueltos aparte a proposito.
 *
 * `team_member` no tiene `unique(team_id, user_id)`, asi que unir la consulta
 * principal contra ella devolveria la misma tarea una vez por cada fila de
 * pertenencia duplicada. `selectDistinct` lo corta en origen.
 */
export async function resolveTeamIds(
  workspaceId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: teamMemberTable.teamId })
    .from(teamMemberTable)
    .innerJoin(teamTable, eq(teamMemberTable.teamId, teamTable.id))
    .where(
      and(
        eq(teamMemberTable.userId, userId),
        eq(teamTable.workspaceId, workspaceId),
      ),
    );

  return rows.map((row) => row.id);
}

/**
 * El predicado de un ambito personal, o `null` cuando no puede casar nada.
 *
 * Devuelve `null` —y no un predicado vacio— para quien no pertenece a ningun
 * equipo: `inArray(col, [])` compila a `in ()`, que es un **error de sintaxis**
 * de Postgres, no una lista vacia. Quien llama tiene que tratar ese `null` como
 * "cero filas", no como "sin filtro".
 */
export async function personalScopeCondition(
  scope: PersonalScope,
  workspaceId: string,
  userId: string,
): Promise<SQL | null> {
  if (scope === "assigned") return assignedCondition(userId);

  const teamIds = await resolveTeamIds(workspaceId, userId);
  if (teamIds.length === 0) return null;

  return inArray(taskTable.teamId, teamIds);
}

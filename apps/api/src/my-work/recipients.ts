import { inArray } from "drizzle-orm";
import db from "../database";
import { teamMemberTable } from "../database/schema";

/**
 * Los eventos que cambian **si** una tarea pertenece a "Mi trabajo" de alguien.
 *
 * Deliberadamente **no** estan `task.updated`, `task.priority_changed`,
 * `task.due_date_changed`, `task.title_changed` ni los de etiquetas: disparan
 * en cada arrastre y en cada edicion de campo, y suscribirse pondria una
 * resolucion de destinatarios en el camino de mutacion mas caliente del
 * producto para una pagina que la mayoria no tiene abierta. Cambian lo que la
 * fila *dice*, no si le toca a alguien, asi que llegan en el siguiente sondeo
 * del cliente.
 *
 * El criterio, en una frase: **la membresia se empuja, el contenido se estira.**
 */
export const MY_WORK_EVENTS = [
  "task.assignees_changed",
  "task.assignee_changed",
  "task.unassigned",
  "task.status_changed",
  "task.team_changed",
  "task.team_unassigned",
  "task.deleted",
] as const;

export type MyWorkEvent = (typeof MY_WORK_EVENTS)[number];

function asId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => asId(item) !== null);
}

async function membersOfTeams(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];

  const rows = await db
    .selectDistinct({ userId: teamMemberTable.userId })
    .from(teamMemberTable)
    .where(inArray(teamMemberTable.teamId, teamIds));

  return rows.map((row) => row.userId);
}

/**
 * A quien hay que refrescarle "Mi trabajo" por este evento.
 *
 * La familia de asignados sale entera de la propia carga util —cero consultas—
 * porque los eventos ya viajan con los ids a los dos lados del cambio. Solo la
 * de equipos toca la base de datos, y lo hace por `teamMember_teamId_idx`.
 */
export async function recipientsForMyWork(
  eventName: string,
  data: Record<string, unknown>,
): Promise<string[]> {
  const recipients = new Set<string>();

  const add = (id: string | null) => {
    if (id) recipients.add(id);
  };

  switch (eventName) {
    case "task.assignees_changed": {
      // Los dos lados: a quien se le suma la tarea y a quien se le quita.
      for (const id of asIdList(data.addedIds)) add(id);
      for (const id of asIdList(data.removedIds)) add(id);
      break;
    }

    case "task.assignee_changed": {
      // `oldAssignee` es el **id** anterior pese al nombre; el que lleva un
      // nombre de persona es `newAssignee`, y el id nuevo es `newAssigneeId`.
      add(asId(data.oldAssignee));
      add(asId(data.newAssigneeId));
      break;
    }

    case "task.unassigned": {
      add(asId(data.previousAssigneeId));
      break;
    }

    case "task.status_changed": {
      // Cubre el gesto mas visible: arrastrar la propia tarea a Hecho y que
      // desaparezca de la pagina. Los coasignados y el equipo caen al sondeo.
      //
      // `bulk-update-tasks` y `cascade-status` publican este evento sin
      // `assigneeId`, asi que ahi no avisa a nadie: es una degradacion al
      // sondeo, no un fallo.
      add(asId(data.assigneeId));
      break;
    }

    case "task.team_changed": {
      const teamIds = [asId(data.oldTeamId), asId(data.newTeamId)].filter(
        (id): id is string => id !== null,
      );
      for (const id of await membersOfTeams(teamIds)) add(id);
      break;
    }

    case "task.team_unassigned": {
      const oldTeamId = asId(data.oldTeamId);
      if (oldTeamId) {
        for (const id of await membersOfTeams([oldTeamId])) add(id);
      }
      break;
    }

    case "task.deleted": {
      for (const id of asIdList(data.assigneeIds)) add(id);
      const teamId = asId(data.teamId);
      if (teamId) {
        for (const id of await membersOfTeams([teamId])) add(id);
      }
      break;
    }
  }

  return [...recipients];
}

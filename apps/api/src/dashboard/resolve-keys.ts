import { eq, inArray } from "drizzle-orm";
import db from "../database";
import {
  columnTable,
  epicTable,
  projectTable,
  teamTable,
  userTable,
} from "../database/schema";
import type { CategoricalGroupBy } from "./aggregate";

export type KeyLabel = {
  label: string;
  color?: string | null;
  icon?: string | null;
};

/**
 * Traduce las claves opacas de un agregado a algo legible.
 *
 * Va aparte y **no** como una union dentro del agregado: mantener la consulta
 * de agregacion sin uniones a `user`, `project` o `column` es lo que hace que
 * su plan sea el mismo para los seis tipos de widget, que es lo que permite
 * medir una sola forma y saber que valen todas.
 *
 * Solo resuelve las agrupaciones cuyo nombre vive en la base. `priority`,
 * `done`, `dueWindow` y los cubos de tiempo son vocabularios cerrados: sus
 * etiquetas son claves de i18n y las pone el cliente, que ademas es el unico
 * que sabe en que idioma.
 */
export default async function resolveKeys(
  groupBy: CategoricalGroupBy | "time" | undefined,
  keys: Array<string | null>,
): Promise<Record<string, KeyLabel>> {
  const ids = keys.filter((key): key is string => key !== null);
  if (ids.length === 0) return {};

  switch (groupBy) {
    case "project": {
      const rows = await db
        .select({
          id: projectTable.id,
          name: projectTable.name,
          icon: projectTable.icon,
        })
        .from(projectTable)
        .where(inArray(projectTable.id, ids));

      return byId(rows.map((r) => [r.id, { label: r.name, icon: r.icon }]));
    }
    case "assignee": {
      const rows = await db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(inArray(userTable.id, ids));

      return byId(rows.map((r) => [r.id, { label: r.name }]));
    }
    case "team": {
      const rows = await db
        .select({ id: teamTable.id, name: teamTable.name })
        .from(teamTable)
        .where(inArray(teamTable.id, ids));

      return byId(rows.map((r) => [r.id, { label: r.name }]));
    }
    case "epic": {
      const rows = await db
        .select({
          id: epicTable.id,
          name: epicTable.name,
          color: epicTable.color,
        })
        .from(epicTable)
        .where(inArray(epicTable.id, ids));

      return byId(rows.map((r) => [r.id, { label: r.name, color: r.color }]));
    }
    case "status":
      // Los slugs son por proyecto, asi que este `groupBy` solo lo admite un
      // widget con proyecto: se resuelve contra las columnas de ese.
      return {};
    default:
      return {};
  }
}

/** Las columnas de un proyecto, para el unico `groupBy` que es suyo. */
export async function resolveStatusKeys(
  projectId: string,
): Promise<Record<string, KeyLabel>> {
  const rows = await db
    .select({
      slug: columnTable.slug,
      name: columnTable.name,
      icon: columnTable.icon,
      color: columnTable.color,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId));

  return byId(
    rows.map((r) => [r.slug, { label: r.name, icon: r.icon, color: r.color }]),
  );
}

function byId(entries: Array<[string, KeyLabel]>): Record<string, KeyLabel> {
  return Object.fromEntries(entries);
}

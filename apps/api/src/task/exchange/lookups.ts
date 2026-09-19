import { and, eq, isNull } from "drizzle-orm";
import db from "../../database";
import {
  columnTable,
  epicTable,
  labelTable,
  teamTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import type { FieldType } from "../../field/field-types";
import type { FieldDefinitionLike } from "../../field/validate-field-values";
import { getValidTaskStatuses } from "../validate-task-fields";

// Todo lo que hay que saber del proyecto para interpretar un fichero, cargado
// **una sola vez**. El importador anterior consultaba las columnas dentro del
// bucle; con 5.000 filas eso son 5.000 consultas identicas.
//
// Las claves de busqueda van normalizadas —minusculas, sin acentos, sin
// espacios de sobra— porque un fichero escrito a mano nunca coincide letra a
// letra con lo que hay guardado.

export type ImportLookups = {
  workspaceId: string;
  validStatuses: string[];
  /** Slug de columna por nombre y por slug normalizados. */
  statusByName: Map<string, string>;
  columnIdBySlug: Map<string, string>;
  /** Identificador de usuario por correo y por nombre normalizados. */
  userByHandle: Map<string, string>;
  teamByName: Map<string, string>;
  epicByName: Map<string, string>;
  /** Color de una etiqueta ya conocida en el espacio, por nombre. */
  labelColorByName: Map<string, string>;
  definitions: FieldDefinitionLike[];
  fieldTypes: Map<string, FieldType>;
};

/** Misma normalizacion para todo lo que se busca por nombre. */
export function normalizeLookupKey(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/**
 * Las claves con las que una columna se deja reconocer al importar.
 *
 * La normal, mas una que **colapsa los separadores**, para que el nombre y el
 * slug de la misma columna caigan juntos: `normalizeLookupKey` solo quita
 * tildes y espacios de los extremos, asi que «To Do» daba `to do` y su slug
 * `to-do` — dos claves distintas para la misma cosa. Con las columnas por
 * defecto ya en castellano, una hoja que diga «To Do» o «in progress» sigue
 * entrando por el slug, que es estable y no se traduce.
 *
 * Va solo en el estado, **no** en personas ni etiquetas: colapsar separadores
 * en un nombre propio juntaria a «Ana Ruiz» con «Anaruiz», y ahi un falso
 * positivo asigna trabajo a quien no toca.
 */
export function statusKeys(value: string): string[] {
  const base = normalizeLookupKey(value);
  const colapsada = base.replace(/[\s_-]+/g, "");

  return colapsada === base ? [base] : [base, colapsada];
}

export async function loadImportLookups(
  projectId: string,
  workspaceId: string,
): Promise<ImportLookups> {
  const [
    validStatuses,
    columns,
    members,
    teams,
    epics,
    workspaceLabels,
    rawDefinitions,
  ] = await Promise.all([
    getValidTaskStatuses(projectId),
    db
      .select({
        id: columnTable.id,
        slug: columnTable.slug,
        name: columnTable.name,
      })
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId)),
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
      })
      .from(workspaceUserTable)
      .innerJoin(userTable, eq(workspaceUserTable.userId, userTable.id))
      .where(eq(workspaceUserTable.workspaceId, workspaceId)),
    db
      .select({ id: teamTable.id, name: teamTable.name })
      .from(teamTable)
      .where(eq(teamTable.workspaceId, workspaceId)),
    db
      .select({ id: epicTable.id, name: epicTable.name })
      .from(epicTable)
      .where(
        and(eq(epicTable.projectId, projectId), isNull(epicTable.archivedAt)),
      ),
    // Las etiquetas de espacio son las que tienen `task_id` nulo: sirven de
    // paleta, para que una etiqueta importada no estrene un color al azar.
    db
      .select({ name: labelTable.name, color: labelTable.color })
      .from(labelTable)
      .where(
        and(eq(labelTable.workspaceId, workspaceId), isNull(labelTable.taskId)),
      ),
    getFieldDefinitionsForProject(workspaceId, projectId),
  ]);

  // La columna es `text` en la base y el CHECK la acota; el tipo se afirma
  // aqui, igual que hace `update-task-custom-fields`.
  const fieldDefinitions = rawDefinitions.map(
    (definition): FieldDefinitionLike => ({
      key: definition.key,
      name: definition.name,
      type: definition.type as FieldType,
      required: definition.required,
      config: definition.config,
    }),
  );

  const statusByName = new Map<string, string>();
  const columnIdBySlug = new Map<string, string>();
  for (const column of columns) {
    columnIdBySlug.set(column.slug, column.id);
    for (const clave of statusKeys(column.name)) {
      statusByName.set(clave, column.slug);
    }
    for (const clave of statusKeys(column.slug)) {
      statusByName.set(clave, column.slug);
    }
  }

  const userByHandle = new Map<string, string>();
  for (const member of members) {
    userByHandle.set(normalizeLookupKey(member.email), member.id);
    // El nombre es el segundo intento y no pisa un correo: dos personas pueden
    // llamarse igual, dos correos no.
    const name = normalizeLookupKey(member.name);
    if (name && !userByHandle.has(name)) {
      userByHandle.set(name, member.id);
    }
    userByHandle.set(member.id, member.id);
  }

  return {
    workspaceId,
    validStatuses,
    statusByName,
    columnIdBySlug,
    userByHandle,
    teamByName: new Map(
      teams.map((team) => [normalizeLookupKey(team.name), team.id]),
    ),
    epicByName: new Map(
      epics.map((epic) => [normalizeLookupKey(epic.name), epic.id]),
    ),
    labelColorByName: new Map(
      workspaceLabels.map((label) => [
        normalizeLookupKey(label.name),
        label.color,
      ]),
    ),
    definitions: fieldDefinitions,
    fieldTypes: new Map(
      fieldDefinitions.map((definition) => [definition.key, definition.type]),
    ),
  };
}

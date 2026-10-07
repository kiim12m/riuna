import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { columnTable } from "../database/schema";
import {
  getFieldDefinitionsForProject,
  getWorkspaceFieldDefinitions,
} from "../field/controllers/get-field-definitions";
import type { FieldDefinitionLike } from "../field/validate-field-values";
import { buildFilter } from "../view/build-filter";
import { buildFieldRegistry } from "../view/field-registry";
import { FilterError, filterToSql } from "../view/filter-to-sql";
import { getWorkspaceFieldRegistry } from "../view/workspace-registry";
import type { AutomationInput, Trigger } from "./definition";
import { assertMembers, assertTeam, validateActions } from "./validate-actions";

const invalid = (message: string) => new HTTPException(400, { message });

function assertTriggerScope(
  trigger: Trigger,
  projectId: string | null,
  columnIds: Set<string>,
  definitions: FieldDefinitionLike[],
) {
  if (trigger.type === "task.status_changed") {
    for (const columnId of [trigger.fromColumnId, trigger.toColumnId]) {
      if (!columnId) continue;
      if (!projectId) {
        throw invalid("A workspace rule cannot name a column: use toFinal");
      }
      if (!columnIds.has(columnId)) {
        throw invalid("The column does not belong to this project");
      }
    }
  }

  if (
    trigger.type === "task.field_changed" &&
    trigger.fieldKey &&
    !definitions.some((definition) => definition.key === trigger.fieldKey)
  ) {
    throw invalid(`Unknown field "${trigger.fieldKey}"`);
  }
}

/**
 * Comprueba una regla contra su espacio y su alcance antes de guardarla: que
 * cada columna, campo, etiqueta, persona y equipo que nombra existe donde
 * actua, y que sus condiciones compilan. Guardar una regla que el motor
 * rechazaria despues la dejaria fallando en silencio en cada evento.
 */
export async function validateAutomation({
  workspaceId,
  projectId,
  input,
}: {
  workspaceId: string;
  projectId: string | null;
  input: AutomationInput;
}) {
  const [columns, definitions, registry] = projectId
    ? await Promise.all([
        db
          .select({ id: columnTable.id })
          .from(columnTable)
          .where(eq(columnTable.projectId, projectId)),
        getFieldDefinitionsForProject(workspaceId, projectId),
        getFieldDefinitionsForProject(workspaceId, projectId, true).then(
          buildFieldRegistry,
        ),
      ])
    : await Promise.all([
        [],
        getWorkspaceFieldDefinitions(workspaceId),
        getWorkspaceFieldRegistry(workspaceId),
      ]);

  const columnIds = new Set(columns.map((column) => column.id));
  const fieldDefinitions = definitions as FieldDefinitionLike[];

  assertTriggerScope(input.trigger, projectId, columnIds, fieldDefinitions);

  if (input.trigger.type === "task.assigned") {
    if (input.trigger.userId) {
      await assertMembers([input.trigger.userId], workspaceId);
    }
    if (input.trigger.teamId) {
      await assertTeam(input.trigger.teamId, workspaceId);
    }
  }

  try {
    filterToSql(buildFilter(input.conditions ?? []), registry);
  } catch (error) {
    if (error instanceof FilterError) throw invalid(error.message);
    throw error;
  }

  await validateActions(input.actions, {
    workspaceId,
    projectId,
    columnIds,
    definitions: fieldDefinitions,
  });
}

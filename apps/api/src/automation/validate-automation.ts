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
 * Una regla programada (el envio del stand-up, ADR 068) es de espacio, nombra
 * un departamento, solo envia stand-ups y no tiene condiciones: no actua sobre
 * ninguna tarea. Y al reves: nada mas nombra un departamento ni envia un
 * stand-up.
 */
function assertScheduleShape(input: AutomationInput, projectId: string | null) {
  const standups = input.actions.filter((action) => action.type === "standup");

  if (input.trigger.type !== "schedule") {
    if (standups.length > 0) throw invalid("A stand-up is sent on a schedule");
    if (input.teamId) throw invalid("Only a scheduled rule names a team");
    return;
  }

  if (projectId) throw invalid("A scheduled rule belongs to the workspace");
  if (!input.teamId) throw invalid("A scheduled rule needs a team");
  if (standups.length !== input.actions.length) {
    throw invalid("A scheduled rule only sends stand-ups");
  }
  if ((input.conditions ?? []).length > 0) {
    throw invalid("A scheduled rule has no conditions");
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
  assertScheduleShape(input, projectId);
  if (input.teamId) await assertTeam(input.teamId, workspaceId);

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

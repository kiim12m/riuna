import { HTTPException } from "hono/http-exception";
import { getFieldDefinitionsForProject } from "../field/controllers/get-field-definitions";
import type { FieldType } from "../field/field-types";
import {
  type FieldDefinitionLike,
  FieldValidationError,
  resolveFieldValueChanges,
} from "../field/validate-field-values";
import { assertValidTaskStatus } from "../task/validate-task-fields";
import type { TemplateNode } from "./content";

/**
 * Lo que `createTask` y el JSONB de campos rechazarian, comprobado para todo el
 * arbol **antes** de crear nada, igual que la profundidad (ADR 027): una
 * plantilla no se despliega a medias.
 *
 * Devuelve los campos personalizados de cada nodo ya validados contra el
 * proyecto destino. Una clave que ese proyecto no define se descarta, porque una
 * plantilla viaja entre proyectos; un valor que no casa con su tipo es un 400.
 */
export async function checkTemplateFits(
  nodes: TemplateNode[],
  projectId: string,
  workspaceId: string,
): Promise<Map<TemplateNode, Record<string, unknown>>> {
  const all = flatten(nodes);

  for (const status of new Set(all.map((node) => node.status ?? "to-do"))) {
    await assertValidTaskStatus(status, projectId);
  }

  const fieldsByNode = new Map<TemplateNode, Record<string, unknown>>();
  const withFields = all.filter(
    (node) => node.customFields && Object.keys(node.customFields).length > 0,
  );

  if (withFields.length === 0) return fieldsByNode;

  const definitions = (
    await getFieldDefinitionsForProject(workspaceId, projectId)
  ).map(
    (definition): FieldDefinitionLike => ({
      key: definition.key,
      name: definition.name,
      type: definition.type as FieldType,
      required: definition.required,
      config: definition.config,
    }),
  );
  // Un calculado tampoco viaja: una plantilla sacada de una tarea lleva su
  // valor, pero en el destino lo vuelve a calcular la base (ADR 090).
  const known = new Set(
    definitions
      .filter((definition) => definition.type !== "formula")
      .map((definition) => definition.key),
  );

  for (const node of withFields) {
    const incoming = Object.fromEntries(
      Object.entries(node.customFields ?? {}).filter(([key]) => known.has(key)),
    );

    try {
      const { set } = resolveFieldValueChanges({ definitions, incoming });
      if (Object.keys(set).length > 0) fieldsByNode.set(node, set);
    } catch (error) {
      if (error instanceof FieldValidationError) {
        throw new HTTPException(400, {
          message: `"${node.title}": ${error.message}`,
        });
      }
      throw error;
    }
  }

  return fieldsByNode;
}

function flatten(nodes: TemplateNode[]): TemplateNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

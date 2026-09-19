import { and, eq, isNotNull, isNull } from "drizzle-orm";
import db from "../database";
import { fieldDefinitionTable } from "../database/schema";
import type { FieldType } from "../field/field-types";
import {
  buildWorkspaceFieldRegistry,
  CUSTOM_FIELD_VALUE_TYPES,
  type FieldRegistry,
} from "./field-registry";

/**
 * El registro de campos para una lectura que cruza proyectos.
 *
 * Dos consultas y ninguna correlacion: las definiciones del espacio, y las
 * claves que algun proyecto redefine **con otra forma de comparacion**. Esas
 * segundas se retiran, porque son las que fallarian en silencio (ver
 * `buildWorkspaceFieldRegistry`).
 *
 * Se comparan formas de comparacion y no tipos: `currency` y `number` compilan
 * ambos a `number`, asi que redefinir uno como el otro no rompe nada y no hay
 * por que retirar el campo.
 *
 * Se **incluyen las archivadas**, por el mismo motivo que `get-tasks.ts`:
 * archivar una definicion la retira de los formularios sin borrar los valores,
 * y sin ellas un widget guardado que la filtrase se caeria entero.
 */
export async function getWorkspaceFieldRegistry(
  workspaceId: string,
): Promise<FieldRegistry> {
  const [workspaceRows, projectRows] = await Promise.all([
    db
      .select({
        key: fieldDefinitionTable.key,
        type: fieldDefinitionTable.type,
      })
      .from(fieldDefinitionTable)
      .where(
        and(
          eq(fieldDefinitionTable.workspaceId, workspaceId),
          isNull(fieldDefinitionTable.projectId),
        ),
      ),
    db
      .selectDistinct({
        key: fieldDefinitionTable.key,
        type: fieldDefinitionTable.type,
      })
      .from(fieldDefinitionTable)
      .where(
        and(
          eq(fieldDefinitionTable.workspaceId, workspaceId),
          isNotNull(fieldDefinitionTable.projectId),
        ),
      ),
  ]);

  const workspaceValueTypeByKey = new Map(
    workspaceRows.map((row) => [
      row.key,
      CUSTOM_FIELD_VALUE_TYPES[row.type as FieldType],
    ]),
  );

  const shadowedKeys = new Set<string>();

  for (const row of projectRows) {
    if (!workspaceValueTypeByKey.has(row.key)) continue;

    const projectValueType = CUSTOM_FIELD_VALUE_TYPES[row.type as FieldType];
    if (projectValueType !== workspaceValueTypeByKey.get(row.key)) {
      shadowedKeys.add(row.key);
    }
  }

  return buildWorkspaceFieldRegistry(workspaceRows, shadowedKeys);
}

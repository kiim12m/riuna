import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  fieldDefinitionTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEventsPaced } from "../../events";
import { upsertExternalRefs } from "../../external-ref";
import { parseFieldConfig, slugifyFieldKey } from "../../field/field-types";
import {
  assertRequiredFieldsPresent,
  FieldValidationError,
  resolveFieldValueChanges,
} from "../../field/validate-field-values";
import { filterAssignableUsers } from "../../utils/assert-assignable-user";
import {
  ensureEpics,
  nextProjectPosition,
  placeExistingTask,
  resolveIdentity,
} from "../exchange/identity";
import { loadImportLookups, normalizeLookupKey } from "../exchange/lookups";
import { type ColumnMapping, mapRows } from "../exchange/map-rows";
import { resolveOutline } from "../exchange/outline";
import type { CellValue } from "../exchange/parse-file";
import {
  type LabelLink,
  type Link,
  type PrimaryChange,
  reconcileAssignees,
  reconcileEpics,
  reconcileLabels,
  reconcilePrimaryAssignees,
} from "../exchange/reconcile-links";
import {
  collectLinks,
  collectUserIds,
  mappedFields,
  mappedLinks,
  resolvePriority,
  resolveStatus,
  resolveUser,
} from "../exchange/resolve-row";
import { planSiblingOrder } from "../exchange/sibling-order";
import { type TaskUpdate, updateTaskRows } from "../exchange/write-tasks";
import {
  childTaskTreeFields,
  rootTaskTreeFields,
  type TreeNode,
} from "../tree";
import claimTaskNumbers from "./claim-task-numbers";
import { lockProjectTree } from "./lock-project-tree";
import { getMaxTaskDepth } from "./update-task-parent";

// Importador del formato de intercambio (ADR 017). Sustituye al de Kaneo, que
// aceptaba siete campos, no sabia de jerarquia y no era idempotente.
//
// Cuatro disciplinas que no son negociables aqui:
//
//  - **Una transaccion, inserciones por lotes.** La forma anterior hacia ~4
//    viajes por fila: 5.000 filas eran ~100 s y cualquier proxy cortaba a
//    medias sin forma de deshacerlo.
//  - **`lockProjectTree` primero, y todo lo del arbol releido dentro.** ADR 016.
//  - **Nada escribe `assignee_id` sin sincronizar `task_assignee`.** ADR 010.
//  - **La jerarquia no se toca si el fichero no trae la columna `Esquema`.**
//    Sin esta guarda, importar una hoja plana promoveria a raiz el proyecto
//    entero.

const INSERT_BATCH_SIZE = 500;

export type ImportInput = {
  projectId: string;
  currentUserId: string;
  /** Nombre de origen para `external_ref`. Ver `buildImportSource`. */
  source: string;
  rows: CellValue[][];
  mapping: ColumnMapping[];
  /** Recorre el camino entero y deshace al final. */
  dryRun?: boolean;
};

export type ImportRowResult =
  | {
      index: number;
      outcome: "created" | "updated";
      taskId: string;
      warnings?: string[];
    }
  | { index: number; outcome: "failed"; error: string };

export type ImportReport = {
  importedAt: string;
  dryRun: boolean;
  source: string;
  project: { id: string; name: string; slug: string };
  fieldsCreated: string[];
  epicsCreated: string[];
  /** En primitivas: el cliente tipado no puede nombrar los tipos de `apps/api`. */
  outline: Array<{
    kind: string;
    index?: number;
    indexes?: number[];
    outline?: string;
    parentOutline?: string;
  }>;
  /**
   * Grupos de hermanas que conservaron su orden porque el fichero no traia
   * todas. Reordenar solo la mitad mezclaria el orden viejo con el nuevo.
   */
  siblingGroupsKept: number;
  results: {
    total: number;
    created: number;
    updated: number;
    failed: number;
    rows: ImportRowResult[];
  };
};

class DryRunComplete extends Error {
  constructor(readonly report: ImportReport) {
    super("dry run");
  }
}

async function importTasks(input: ImportInput): Promise<ImportReport> {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, input.projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  let outcome: { report: ImportReport; created: Task[] };

  try {
    outcome = await db.transaction((tx) => run(tx, input, project));
  } catch (error) {
    if (error instanceof DryRunComplete) {
      return error.report;
    }
    throw error;
  }

  // Los eventos van **despues** del commit: emitirlos dentro haria que un
  // consumidor leyera una tarea que todavia no existe para el, y un fallo
  // posterior dejaria avisos de algo que se deshizo.
  //
  // Y por tandas y sin esperar la respuesta: miles de `task.created` de golpe
  // dejaban a los gestores sin conexion y perdian su actividad (ver
  // `publishEventsPaced`). Quien importa ya tiene su informe; los avisos y la
  // actividad llegan en cuanto la base va dando de si.
  void publishEventsPaced(
    outcome.created.map((task) => ({
      type: "task.created",
      data: {
        ...task,
        taskId: task.id,
        userId: task.userId ?? "",
        currentUserId: input.currentUserId,
        type: "create",
        content: "imported the task",
      },
    })),
  ).catch((error) => console.error("Failed to publish import events:", error));

  return outcome.report;
}

type Task = typeof taskTable.$inferSelect;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Project = NonNullable<
  Awaited<ReturnType<typeof db.query.projectTable.findFirst>>
>;

async function run(
  tx: Tx,
  input: ImportInput,
  project: Project,
): Promise<{ report: ImportReport; created: Task[] }> {
  await lockProjectTree(tx, input.projectId);

  const lookups = await loadImportLookups(input.projectId, project.workspaceId);
  const fieldTypes = new Map(lookups.fieldTypes);
  const definitions = [...lookups.definitions];

  // --- Definiciones de campo que el mapeo pide crear -----------------------

  const fieldsCreated: string[] = [];
  for (const column of input.mapping) {
    if (column.target.kind !== "custom" || !column.target.create) continue;
    if (fieldTypes.has(column.target.key)) continue;

    const { name, type, options } = column.target.create;
    const key = slugifyFieldKey(name) || column.target.key;
    const config = parseFieldConfig(
      type,
      options
        ? { options: options.map((value) => ({ value, label: value })) }
        : {},
    );

    await tx.insert(fieldDefinitionTable).values({
      workspaceId: project.workspaceId,
      projectId: input.projectId,
      key,
      name,
      type,
      config,
    });

    fieldTypes.set(key, type);
    definitions.push({ key, name, type, required: false, config });
    fieldsCreated.push(key);
  }

  // --- Filas y jerarquia ---------------------------------------------------

  const mapped = mapRows(input.rows, input.mapping, fieldTypes);
  const outline = resolveOutline(
    mapped.map((row) => ({ index: row.index, outline: row.outline })),
  );
  const resolutionByIndex = new Map(
    outline.resolutions.map((entry) => [entry.index, entry]),
  );

  const outlineMapped = input.mapping.some(
    (column) =>
      column.target.kind === "field" && column.target.field === "outline",
  );

  // --- Identidad -----------------------------------------------------------

  const existingByRow = await resolveIdentity(
    tx,
    input.projectId,
    project.workspaceId,
    input.source,
    mapped,
  );

  // --- Preparacion fila a fila ---------------------------------------------

  const assignableIds = await filterAssignableUsers(
    collectUserIds(mapped, lookups.userByHandle),
    project.workspaceId,
  );
  const epicIdByName = await ensureEpics(tx, input.projectId, mapped, lookups);
  const maxDepth = await getMaxTaskDepth(input.projectId, tx);
  const basePosition = await nextProjectPosition(tx, input.projectId);

  const nodeByRow = new Map<number, TreeNode>();
  /** Tarea ya reclamada -> primera fila que la reclamo. */
  const claimedTasks = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const inserts: Array<typeof taskTable.$inferInsert> = [];
  const updates: TaskUpdate[] = [];
  const insertedRowIndexes: number[] = [];
  const updatedRowIndexes: number[] = [];

  const assigneeLinks: Link[] = [];
  const primaryChanges: PrimaryChange[] = [];
  const epicLinks: Link[] = [];
  const labelLinks: LabelLink[] = [];
  const assigneeTaskIds: string[] = [];
  const epicTaskIds: string[] = [];
  const labelTaskIds: string[] = [];
  const externalPairs: Array<{ externalId: string; entityId: string }> = [];

  const fields = mappedFields(input.mapping);
  const links = mappedLinks(input.mapping);
  const touchesCustomFields = input.mapping.some(
    (column) => column.target.kind === "custom",
  );

  for (const row of mapped) {
    if (row.errors.length > 0) {
      results.push({
        index: row.index,
        outcome: "failed",
        error: row.errors[0] ?? "Invalid row",
      });
      continue;
    }

    const warnings: string[] = [];
    const status = resolveStatus(row, lookups, warnings);
    const priority = resolvePriority(row, warnings);
    const assigneeId = fields.has("assigneeId")
      ? resolveUser(row.assignee, lookups, assignableIds, warnings)
      : null;
    const teamId = row.team
      ? (lookups.teamByName.get(normalizeLookupKey(row.team)) ?? null)
      : null;
    if (row.team && !teamId) {
      warnings.push(`Unknown team "${row.team}"`);
    }

    let customFields: { set: Record<string, unknown>; clear: string[] };
    try {
      customFields = resolveFieldValueChanges({
        definitions,
        incoming: row.customFields,
      });
    } catch (error) {
      results.push({
        index: row.index,
        outcome: "failed",
        error:
          error instanceof FieldValidationError
            ? error.message
            : "Invalid field value",
      });
      continue;
    }

    const existing = existingByRow.get(row.index) ?? null;

    // Dos filas del mismo fichero no pueden reclamar la misma tarea. El
    // `UPDATE ... FROM unnest` no protesta —se queda con una de las dos en
    // silencio— y el informe diria "2 actualizadas" sobre una sola fila. Es el
    // mismo criterio que la regla del esquema repetido: no se adivina.
    if (existing) {
      const firstRow = claimedTasks.get(existing.id);
      if (firstRow !== undefined) {
        results.push({
          index: row.index,
          outcome: "failed",
          error: `Row ${firstRow + 1} already refers to this task`,
        });
        continue;
      }
      claimedTasks.set(existing.id, row.index);
    }

    const resolution = resolutionByIndex.get(row.index);
    const parentNode =
      outlineMapped && resolution?.parentIndex != null
        ? (nodeByRow.get(resolution.parentIndex) ?? null)
        : null;

    if (existing) {
      // Si el fichero no mapea `Responsable`, `assignee_id` no se toca, asi
      // que el responsable efectivo sigue siendo el que ya tenia. Hay que
      // pasarlo a `collectLinks` para que no se caiga de `task_assignee`.
      const effectiveAssignee = fields.has("assigneeId")
        ? assigneeId
        : existing.userId;

      const node = await placeExistingTask(tx, {
        existing,
        parentNode,
        outlineMapped,
        blankOutline: row.outline.trim() === "",
        parentMissing: resolution?.parentMissing ?? false,
        maxDepth,
        warnings,
      });

      nodeByRow.set(row.index, node);
      updates.push({
        id: existing.id,
        title: row.title,
        description: row.description,
        status,
        columnId: lookups.columnIdBySlug.get(status) ?? null,
        priority,
        startDate: row.startDate,
        dueDate: row.dueDate,
        estimate: row.estimateSeconds,
        assigneeId,
        teamId,
        customFieldsSet: customFields.set,
        customFieldsClear: customFields.clear,
      });
      updatedRowIndexes.push(row.index);
      results.push({
        index: row.index,
        outcome: "updated",
        taskId: existing.id,
        ...(warnings.length > 0 && { warnings }),
      });
      collectLinks(row, existing.id, {
        lookups,
        assignableIds,
        epicIdByName,
        workspaceId: project.workspaceId,
        assigneeId: effectiveAssignee,
        previousAssigneeId: existing.userId,
        assigneeLinks,
        primaryChanges,
        epicLinks,
        labelLinks,
        assigneeTaskIds,
        epicTaskIds,
        labelTaskIds,
        links,
      });
      if (row.reference) {
        externalPairs.push({
          externalId: row.reference,
          entityId: existing.id,
        });
      }
      continue;
    }

    // Fila nueva. Un titulo vacio la hunde aqui y no en `mapRow`: una fila que
    // casa con una tarea existente sin traer la columna `Título` es valida y
    // conserva el que tiene.
    if (!row.title) {
      results.push({
        index: row.index,
        outcome: "failed",
        error: "The row has no title",
      });
      continue;
    }

    // `assertRequiredFieldsPresent` solo aplica al alta: una tarea que ya
    // existe puede tener sus obligatorios rellenos de antes.
    try {
      assertRequiredFieldsPresent({ definitions, values: customFields.set });
    } catch (error) {
      results.push({
        index: row.index,
        outcome: "failed",
        error:
          error instanceof FieldValidationError
            ? error.message
            : "Missing required field",
      });
      continue;
    }

    const tree = parentNode
      ? childTaskTreeFields(parentNode)
      : rootTaskTreeFields();

    if (tree.depth + 1 > maxDepth) {
      results.push({
        index: row.index,
        outcome: "failed",
        error: "The resulting subtree would exceed the project's depth limit",
      });
      continue;
    }

    nodeByRow.set(row.index, {
      id: tree.id,
      path: tree.path,
      depth: tree.depth,
    });

    inserts.push({
      ...tree,
      projectId: input.projectId,
      userId: assigneeId,
      teamId,
      title: row.title,
      description: row.description ?? "",
      status,
      columnId: lookups.columnIdBySlug.get(status) ?? null,
      priority,
      startDate: row.startDate,
      dueDate: row.dueDate,
      estimate: row.estimateSeconds,
      customFields: customFields.set,
      position: basePosition + inserts.length,
      // Se rellena cuando se sepa el primer numero del lote.
      number: 0,
    });
    insertedRowIndexes.push(row.index);
    results.push({
      index: row.index,
      outcome: "created",
      taskId: tree.id,
      ...(warnings.length > 0 && { warnings }),
    });
    collectLinks(row, tree.id, {
      lookups,
      assignableIds,
      epicIdByName,
      workspaceId: project.workspaceId,
      assigneeId,
      previousAssigneeId: null,
      assigneeLinks,
      primaryChanges,
      epicLinks,
      labelLinks,
      assigneeTaskIds,
      epicTaskIds,
      labelTaskIds,
      links,
    });
    if (row.reference) {
      externalPairs.push({ externalId: row.reference, entityId: tree.id });
    }
  }

  // --- Orden de las hermanas ---------------------------------------------------

  // Con `Esquema` mapeado, el fichero decide tambien el orden entre hermanas,
  // no solo de quien cuelgan. Solo se aplica a los grupos que el fichero trae
  // enteros: ver `planSiblingOrder`.
  let siblingGroupsKept = 0;
  if (outlineMapped) {
    const placedRows = mapped
      .filter((row) => nodeByRow.has(row.index))
      .map((row) => ({
        rowIndex: row.index,
        taskId: (nodeByRow.get(row.index) as TreeNode).id,
        blankOutline: row.outline.trim() === "",
      }));

    const plan = await planSiblingOrder(
      tx,
      input.projectId,
      basePosition,
      placedRows,
      resolutionByIndex,
      nodeByRow,
    );
    siblingGroupsKept = plan.skippedIncompleteGroups;

    insertedRowIndexes.forEach((rowIndex, k) => {
      const position = plan.positionByRowIndex.get(rowIndex);
      const values = inserts[k];
      if (position !== undefined && values) values.position = position;
    });
    updatedRowIndexes.forEach((rowIndex, k) => {
      const position = plan.positionByRowIndex.get(rowIndex);
      const update = updates[k];
      if (position !== undefined && update) update.position = position;
    });
  }

  // --- Escritura -----------------------------------------------------------

  const created: Task[] = [];

  if (inserts.length > 0) {
    const firstNumber = await claimTaskNumbers(
      input.projectId,
      inserts.length,
      tx,
    );
    inserts.forEach((values, index) => {
      values.number = firstNumber + index;
    });

    for (let start = 0; start < inserts.length; start += INSERT_BATCH_SIZE) {
      const batch = inserts.slice(start, start + INSERT_BATCH_SIZE);
      created.push(...(await tx.insert(taskTable).values(batch).returning()));
    }
  }

  await updateTaskRows(tx, updates, fields, touchesCustomFields);

  // Cada relacion lleva **su propia** lista de tareas. Compartir una sola era
  // destructivo: un fichero que solo mapease `Etiquetas` metia esas tareas en
  // la lista y las otras dos reconciliaciones, con su lista de enlaces vacia,
  // les borraban todos los asignados y todas las epicas.
  //
  // Si el fichero trae `Asignados`, el responsable principal ya viene dentro de
  // `assigneeLinks` (ver `collectLinks`) y la ADR 010 se cumple al reconciliar.
  // Si solo trae `Responsable`, el conjunto no se reconcilia: solo se cambia el
  // responsable, con `primaryChanges`.
  await reconcileAssignees(tx, assigneeTaskIds, assigneeLinks);
  await reconcilePrimaryAssignees(tx, primaryChanges);
  await reconcileEpics(tx, epicTaskIds, epicLinks);
  await reconcileLabels(tx, labelTaskIds, labelLinks);

  await upsertExternalRefs(
    project.workspaceId,
    input.source,
    "task",
    externalPairs,
    tx,
  );

  const report: ImportReport = {
    importedAt: new Date().toISOString(),
    dryRun: Boolean(input.dryRun),
    source: input.source,
    project: { id: project.id, name: project.name, slug: project.slug },
    fieldsCreated,
    epicsCreated: [...epicIdByName.keys()].filter(
      (name) => !lookups.epicByName.has(name),
    ),
    outline: outline.issues,
    siblingGroupsKept,
    results: {
      total: mapped.length,
      created: insertedRowIndexes.length,
      updated: updatedRowIndexes.length,
      failed: results.filter((entry) => entry.outcome === "failed").length,
      rows: results,
    },
  };

  if (input.dryRun) {
    // Lanzar deshace la transaccion. Es la unica forma de recorrer el camino
    // real —restricciones de la base incluidas— sin dejar rastro.
    throw new DryRunComplete(report);
  }

  return { report, created };
}

export default importTasks;

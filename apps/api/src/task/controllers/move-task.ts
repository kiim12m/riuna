import { and, asc, eq, inArray, like, max, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  assetTable,
  columnTable,
  projectTable,
  taskEpicTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import { refreshFormulasAfter } from "../../field/formula/refresh";
import { scheduleAfter } from "../schedule/reschedule";
import { rebasePath, rootPath, subtreePattern } from "../tree";
import claimTaskNumbers from "./claim-task-numbers";
import { lockProjectTree } from "./lock-project-tree";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function isSameProjectMove(
  sourceProjectId: string,
  destinationProjectId: string,
) {
  return sourceProjectId === destinationProjectId;
}

type DestinationColumn = { id: string; slug: string; position: number };

async function loadDestinationColumns(destinationProjectId: string) {
  const destinationColumns = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      position: columnTable.position,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, destinationProjectId))
    .orderBy(asc(columnTable.position));

  if (destinationColumns.length === 0) {
    throw new HTTPException(400, {
      message: "Destination project does not have a workflow",
    });
  }

  return destinationColumns;
}

/**
 * A que columna del destino va una tarea, dado el estado que trae.
 *
 * Es pura y se aplica **por tarea**, no una vez para toda la rama: estampar
 * sobre los descendientes el estado resuelto para la raiz reabria lo terminado
 * y desarchivaba lo archivado, perdiendo el trabajo de la rama sin aviso.
 *
 * `requestedStatus` solo lo pide quien mueve, y solo se aplica a la raiz.
 */
function pickDestinationColumn(
  destinationColumns: DestinationColumn[],
  currentStatus: string,
  requestedStatus?: string,
): DestinationColumn | null {
  // `archived` no es una columna: es un estado al margen del flujo. Se
  // conserva tal cual, con `column_id` nulo, como hace la cascada.
  if (!requestedStatus && currentStatus === "archived") {
    return null;
  }

  const requestedColumn = requestedStatus
    ? destinationColumns.find((column) => column.slug === requestedStatus)
    : null;

  if (requestedStatus && !requestedColumn) {
    throw new HTTPException(400, {
      message: "Selected status is not valid for the destination project",
    });
  }

  const matchingCurrentColumn = destinationColumns.find(
    (column) => column.slug === currentStatus,
  );

  // `loadDestinationColumns` ya garantiza que hay al menos una.
  return (
    requestedColumn ?? matchingCurrentColumn ?? destinationColumns[0] ?? null
  );
}

function statusFieldsFor(column: DestinationColumn | null) {
  return column
    ? { status: column.slug, columnId: column.id }
    : { status: "archived", columnId: null };
}

async function getNextTaskPosition(
  dbOrTx: DbOrTx,
  projectId: string,
  status: string,
  columnId: string,
) {
  const [maxPositionResult] = await dbOrTx
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(taskTable.status, status),
        eq(taskTable.columnId, columnId),
      ),
    );

  return (maxPositionResult?.maxPosition ?? 0) + 1;
}

async function moveTask({
  taskId,
  destinationProjectId,
  destinationStatus,
  currentUserId,
}: {
  taskId: string;
  destinationProjectId: string;
  destinationStatus?: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (isSameProjectMove(existingTask.projectId, destinationProjectId)) {
    throw new HTTPException(400, {
      message: "Task is already in that project",
    });
  }

  const [sourceProject, destinationProject] = await Promise.all([
    db.query.projectTable.findFirst({
      where: eq(projectTable.id, existingTask.projectId),
    }),
    db.query.projectTable.findFirst({
      where: eq(projectTable.id, destinationProjectId),
    }),
  ]);

  if (!sourceProject || !destinationProject) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  if (sourceProject.workspaceId !== destinationProject.workspaceId) {
    throw new HTTPException(400, {
      message: "Tasks can only be moved within the same workspace",
    });
  }

  const destinationColumns = await loadDestinationColumns(destinationProjectId);

  // Las claves de campo personalizado que siguen teniendo definicion en el
  // destino. Los de alcance espacio sobreviven; los de alcance proyecto se van
  // con su proyecto. Se incluyen las archivadas: archivar retira el campo de
  // los formularios, no invalida el valor guardado.
  const destinationDefinitions = await getFieldDefinitionsForProject(
    destinationProject.workspaceId,
    destinationProjectId,
    true,
  );
  const allowedFieldKeys = destinationDefinitions.map(
    (definition) => definition.key,
  );

  // Toda la rama que viaja: en el destino se recalcula lo suyo (ADR 090).
  let movedIds: string[] = [];

  const movedTask = await db.transaction(async (tx) => {
    // Se toma sobre el proyecto de origen, que es de donde se arranca la rama.
    await lockProjectTree(tx, existingTask.projectId);

    // Padre e hija comparten proyecto siempre (ADR 011), asi que mover una
    // tarea es mover su rama entera. La tarea movida pasa a ser raiz en el
    // destino: su padre se queda donde estaba.
    //
    // La rama se lee ya dentro de la transaccion y con el cerrojo tomado: leerla
    // antes dejaba fuera lo que se hubiera colgado de ella mientras tanto, y esa
    // hija se quedaba en el proyecto de origen con `parent_id` apuntando a una
    // tarea del destino.
    const subtree = await tx
      .select({
        id: taskTable.id,
        path: taskTable.path,
        depth: taskTable.depth,
        status: taskTable.status,
      })
      .from(taskTable)
      .where(
        and(
          eq(taskTable.projectId, existingTask.projectId),
          like(taskTable.path, subtreePattern(existingTask.path)),
        ),
      )
      .orderBy(asc(taskTable.depth));

    const [root] = subtree;

    if (!root) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    // La altura de la rama tras aterrizar, contando desde 1. El limite del
    // destino guarda esta puerta igual que `rejectReparent` guarda la otra: sin
    // esto, una rama de cinco niveles cae en un proyecto que declara dos y deja
    // el limite incoherente de forma permanente.
    const deepest = subtree.reduce((max, node) => Math.max(max, node.depth), 0);
    const subtreeHeight = deepest - root.depth;

    if (subtreeHeight + 1 > destinationProject.maxTaskDepth) {
      throw new HTTPException(400, {
        message:
          "The branch is deeper than the destination project's task depth limit",
      });
    }

    const descendants = subtree.filter((node) => node.id !== taskId);
    const subtreeIds = subtree.map((node) => node.id);
    movedIds = subtreeIds;
    const newRootPath = rootPath(taskId);

    const rootColumn = pickDestinationColumn(
      destinationColumns,
      root.status,
      destinationStatus,
    );
    const rootStatus = statusFieldsFor(rootColumn);

    const [firstNumber, nextPosition] = await Promise.all([
      claimTaskNumbers(destinationProjectId, subtree.length, tx),
      rootColumn
        ? getNextTaskPosition(
            tx,
            destinationProjectId,
            rootColumn.slug,
            rootColumn.id,
          )
        : Promise.resolve(1),
    ]);

    const [updatedTask] = await tx
      .update(taskTable)
      .set({
        projectId: destinationProjectId,
        ...rootStatus,
        number: firstNumber,
        position: nextPosition,
        parentId: null,
        path: newRootPath,
        depth: 0,
      })
      .where(eq(taskTable.id, taskId))
      .returning();

    if (!updatedTask) {
      throw new HTTPException(500, {
        message: "Failed to move task",
      });
    }

    // Los descendientes conservan su forma —quien cuelga de quien— y su
    // estado. Solo cambian de proyecto, de numero y de raiz del camino.
    let number = firstNumber + 1;
    for (const descendant of descendants) {
      await tx
        .update(taskTable)
        .set({
          projectId: destinationProjectId,
          ...statusFieldsFor(
            pickDestinationColumn(destinationColumns, descendant.status),
          ),
          number: number++,
          path: rebasePath(descendant.path, existingTask.path, newRootPath),
          depth: descendant.depth - existingTask.depth,
        })
        .where(eq(taskTable.id, descendant.id));
    }

    // Las epicas son por proyecto: conservarlas dejaba la rama colgada de
    // epicas del origen, que el detalle mostraba, el tablero del destino no, y
    // cuyos contadores seguian incluyendo tareas que ya no estaban alli.
    await tx
      .delete(taskEpicTable)
      .where(inArray(taskEpicTable.taskId, subtreeIds));

    // Y los valores de campos que el destino no define quedaban invisibles en
    // el editor e imposibles de borrar por la API.
    await tx
      .update(taskTable)
      .set({
        // `sql.param` es obligatorio aqui: en una plantilla `sql`, drizzle
        // expande un array a `($1, $2, ...)` en vez de pasarlo como un solo
        // parametro, y `()::text[]` no compila.
        customFields: sql`(
          SELECT coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
          FROM jsonb_each(${taskTable.customFields}) AS entry(key, value)
          WHERE entry.key = ANY(${sql.param(allowedFieldKeys)}::text[])
        )`,
      })
      .where(inArray(taskTable.id, subtreeIds));

    await tx
      .update(assetTable)
      .set({ projectId: destinationProjectId })
      .where(inArray(assetTable.taskId, subtreeIds));

    // Una precedencia solo vale dentro de un proyecto (ADR 084): las que
    // quedarian cruzando de uno a otro se rompen. Las de dentro de la rama
    // viajan con ella.
    await tx.delete(taskRelationTable).where(
      and(
        eq(taskRelationTable.relationType, "precedes"),
        sql`(${taskRelationTable.sourceTaskId} = ANY(${sql.param(subtreeIds)}::text[]))
          <> (${taskRelationTable.targetTaskId} = ANY(${sql.param(subtreeIds)}::text[]))`,
      ),
    );

    return updatedTask;
  });

  // La rama de origen pierde una hija y puede encoger (ADR 083).
  await scheduleAfter({
    projectId: sourceProject.id,
    taskIds: [existingTask.parentId],
    actorId: currentUserId,
    origin: taskId,
  });
  // Los campos calculados de la rama de origen pierden lo que se fue, y la
  // rama que llega se calcula con las formulas del destino.
  await refreshFormulasAfter({
    projectId: sourceProject.id,
    taskIds: [existingTask.parentId],
  });
  await refreshFormulasAfter({
    projectId: destinationProject.id,
    taskIds: movedIds,
  });

  await publishEvent("task.moved", {
    taskId,
    type: "moved",
    userId: currentUserId,
    fromProjectId: sourceProject.id,
    fromProjectName: sourceProject.name,
    toProjectId: destinationProject.id,
    toProjectName: destinationProject.name,
    oldStatus: existingTask.status,
    newStatus: movedTask.status,
  });

  return {
    task: movedTask,
    sourceProjectId: sourceProject.id,
    destinationProjectId: destinationProject.id,
  };
}

export default moveTask;

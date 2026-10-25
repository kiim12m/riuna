import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable, templateTable } from "../../database/schema";
import { createTaskInTransaction } from "../../task/controllers/create-task";
import { getMaxTaskDepth } from "../../task/controllers/update-task-parent";
import { checkTemplateFits } from "../check-template";
import {
  countTemplateTasks,
  parseTemplateContent,
  type TemplateNode,
  templateDepth,
} from "../content";
import { decorateTask, resolveEpics } from "../decorate-task";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Despliega el arbol de la plantilla dentro de un proyecto.
 *
 * **Cada tarea se crea con `createTaskInTransaction`**, no con inserciones
 * directas: es lo unico que toma el cerrojo del proyecto, resuelve
 * `path`/`depth`, reclama el numero de tarea y sincroniza el responsable.
 * Insertar a mano seria mas rapido y dejaria el arbol incoherente, que es lo
 * que las dos CHECK de la Fase 2 existen para impedir. Lo que cada alta hace al
 * confirmarse se apunta en `afterCommit`.
 */
async function createBranch({
  tx,
  afterCommit,
  nodes,
  projectId,
  parentId,
  currentUserId,
  workspaceId,
  epicIdsByName,
  fieldsByNode,
}: {
  tx: Tx;
  afterCommit: Array<() => Promise<void>>;
  nodes: TemplateNode[];
  projectId: string;
  parentId: string | null;
  currentUserId: string;
  workspaceId: string;
  epicIdsByName: Map<string, string>;
  fieldsByNode: Map<TemplateNode, Record<string, unknown>>;
}): Promise<number> {
  let created = 0;

  for (const node of nodes) {
    const { task, afterCommit: published } = await createTaskInTransaction(tx, {
      projectId,
      currentUserId,
      title: node.title,
      status: node.status ?? "to-do",
      description: node.description,
      priority: node.priority,
      estimate: node.estimate,
      parentId,
    });
    afterCommit.push(published);

    created += 1;

    await decorateTask({
      dbOrTx: tx,
      taskId: task.id,
      workspaceId,
      customFields: fieldsByNode.get(node),
      labels: node.labels,
      epics: node.epics,
      epicIdsByName,
    });

    if (node.children?.length) {
      created += await createBranch({
        tx,
        afterCommit,
        nodes: node.children,
        projectId,
        parentId: task.id,
        currentUserId,
        workspaceId,
        epicIdsByName,
        fieldsByNode,
      });
    }
  }

  return created;
}

function collectEpicNames(nodes: TemplateNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.epics ?? []),
    ...collectEpicNames(node.children ?? []),
  ]);
}

/**
 * Aplica una plantilla de tarea dentro de un proyecto.
 *
 * La profundidad se comprueba **antes** de crear nada: aunque la transaccion ya
 * impide dejar media plantilla, asi el error llega antes y con un mensaje
 * claro. Devuelve aparte lo que hay que hacer cuando quien llama confirme.
 */
export async function applyTaskTemplateInTransaction(
  tx: Tx,
  {
    templateId,
    projectId,
    parentId,
    currentUserId,
  }: {
    templateId: string;
    projectId: string;
    parentId?: string | null;
    currentUserId: string;
  },
) {
  const template = await tx.query.templateTable.findFirst({
    where: eq(templateTable.id, templateId),
  });

  if (!template)
    throw new HTTPException(404, { message: "Template not found" });

  const project = await tx.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) throw new HTTPException(404, { message: "Project not found" });

  if (project.workspaceId !== template.workspaceId) {
    throw new HTTPException(400, {
      message: "The template belongs to another workspace",
    });
  }

  let content: ReturnType<typeof parseTemplateContent>;

  try {
    content = parseTemplateContent(template.content);
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : "Invalid template",
    });
  }

  let parentDepth = -1;

  if (parentId) {
    const parent = await tx.query.taskTable.findFirst({
      where: and(
        eq(taskTable.id, parentId),
        eq(taskTable.projectId, projectId),
      ),
    });

    if (!parent) {
      throw new HTTPException(400, {
        message: "The parent task must belong to the same project",
      });
    }

    parentDepth = parent.depth;
  }

  const maxDepth = await getMaxTaskDepth(projectId, tx);
  const needed = parentDepth + 1 + templateDepth(content.tasks);

  if (needed > maxDepth) {
    throw new HTTPException(400, {
      message: `The template does not fit: it needs ${needed} levels and this project allows ${maxDepth}`,
    });
  }

  // Estados y campos, como la profundidad, antes de la primera escritura:
  // `resolveEpics` ya crea epicas.
  const fieldsByNode = await checkTemplateFits(
    content.tasks,
    projectId,
    project.workspaceId,
    tx,
  );

  const epicIdsByName = await resolveEpics(
    projectId,
    collectEpicNames(content.tasks),
    tx,
  );

  const afterCommit: Array<() => Promise<void>> = [];
  const created = await createBranch({
    tx,
    afterCommit,
    nodes: content.tasks,
    projectId,
    parentId: parentId ?? null,
    currentUserId,
    workspaceId: project.workspaceId,
    epicIdsByName,
    fieldsByNode,
  });

  return {
    result: { templateId, projectId, createdTaskCount: created },
    afterCommit: async () => {
      for (const publish of afterCommit) await publish();
    },
  };
}

/**
 * Aplica una plantilla en su propia transaccion: o se crea el arbol entero o
 * nada, y los avisos salen solo si se confirma (auditoria 1.9).
 */
export async function applyTaskTemplate(
  args: Parameters<typeof applyTaskTemplateInTransaction>[1],
) {
  const { result, afterCommit } = await db.transaction((tx) =>
    applyTaskTemplateInTransaction(tx, args),
  );
  await afterCommit();
  return result;
}

/** Cuantas tareas trae una plantilla, para enseñarlo antes de aplicarla. */
export function templateTaskCount(content: unknown): number {
  try {
    return countTemplateTasks(parseTemplateContent(content).tasks);
  } catch {
    return 0;
  }
}

import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable, templateTable } from "../../database/schema";
import createTask from "../../task/controllers/create-task";
import { getMaxTaskDepth } from "../../task/controllers/update-task-parent";
import { checkTemplateFits } from "../check-template";
import {
  countTemplateTasks,
  parseTemplateContent,
  type TemplateNode,
  templateDepth,
} from "../content";
import { decorateTask, resolveEpics } from "../decorate-task";

/**
 * Despliega el arbol de la plantilla dentro de un proyecto.
 *
 * **Cada tarea se crea con `createTask`**, no con inserciones directas: es lo
 * unico que toma el cerrojo del proyecto, resuelve `path`/`depth`, reclama el
 * numero de tarea y sincroniza el responsable. Insertar a mano seria mas rapido
 * y dejaria el arbol incoherente, que es lo que las dos CHECK de la Fase 2
 * existen para impedir.
 */
async function createBranch({
  nodes,
  projectId,
  parentId,
  currentUserId,
  workspaceId,
  epicIdsByName,
  fieldsByNode,
}: {
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
    const task = await createTask({
      projectId,
      currentUserId,
      title: node.title,
      status: node.status ?? "to-do",
      description: node.description,
      priority: node.priority,
      estimate: node.estimate,
      parentId,
    });

    created += 1;

    await decorateTask({
      taskId: task.id,
      workspaceId,
      customFields: fieldsByNode.get(node),
      labels: node.labels,
      epics: node.epics,
      epicIdsByName,
    });

    if (node.children?.length) {
      created += await createBranch({
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
 * La profundidad se comprueba **antes** de crear nada. Sin esta guarda, un arbol
 * mas hondo que el limite del proyecto fallaria a mitad —`createTask` rechaza
 * cada hija demasiado profunda— y dejaria medio desplegada una plantilla que
 * nadie pidio a medias.
 */
export async function applyTaskTemplate({
  templateId,
  projectId,
  parentId,
  currentUserId,
}: {
  templateId: string;
  projectId: string;
  parentId?: string | null;
  currentUserId: string;
}) {
  const template = await db.query.templateTable.findFirst({
    where: eq(templateTable.id, templateId),
  });

  if (!template)
    throw new HTTPException(404, { message: "Template not found" });

  const project = await db.query.projectTable.findFirst({
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
    const parent = await db.query.taskTable.findFirst({
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

  const maxDepth = await getMaxTaskDepth(projectId);
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
  );

  const epicIdsByName = await resolveEpics(
    projectId,
    collectEpicNames(content.tasks),
  );

  const created = await createBranch({
    nodes: content.tasks,
    projectId,
    parentId: parentId ?? null,
    currentUserId,
    workspaceId: project.workspaceId,
    epicIdsByName,
    fieldsByNode,
  });

  return { templateId, projectId, createdTaskCount: created };
}

/** Cuantas tareas trae una plantilla, para enseñarlo antes de aplicarla. */
export function templateTaskCount(content: unknown): number {
  try {
    return countTemplateTasks(parseTemplateContent(content).tasks);
  } catch {
    return 0;
  }
}

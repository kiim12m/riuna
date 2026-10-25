import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { epicTable, templateTable } from "../../database/schema";
import { insertProject } from "../../project/controllers/create-project";
import { parseTemplateContent } from "../content";
import { applyTaskTemplateInTransaction } from "./apply-template";

/**
 * Crea un proyecto entero a partir de una plantilla: con **sus** columnas (las
 * cuatro de siempre si la plantilla no trae), sus epicas y su arbol de tareas.
 *
 * Aplicar una plantilla a un proyecto que ya existe solo despliega el arbol
 * (ADR 027); esto cierra el hueco de empezar de cero. El arbol se despliega con
 * `applyTaskTemplateInTransaction`, en la misma transaccion que el proyecto: si
 * algo falla a mitad no queda ni el proyecto ni sus tareas, y como los
 * `task.created` salen solo al confirmar, tampoco se ha avisado de nada.
 */
export async function createProjectFromTemplate({
  workspaceId,
  name,
  icon,
  slug,
  templateId,
  currentUserId,
}: {
  workspaceId: string;
  name: string;
  icon: string;
  slug: string;
  templateId: string;
  currentUserId: string;
}) {
  const template = await db.query.templateTable.findFirst({
    where: eq(templateTable.id, templateId),
  });

  // El mismo 404 para "no existe" y "es de otro espacio": no se confirma que
  // exista en uno ajeno.
  if (!template || template.workspaceId !== workspaceId) {
    throw new HTTPException(404, { message: "Template not found" });
  }

  // Una plantilla de tarea se aplica dentro de un proyecto que ya existe; no
  // trae columnas ni epicas de proyecto.
  if (template.kind !== "project") {
    throw new HTTPException(400, { message: "Not a project template" });
  }

  let content: ReturnType<typeof parseTemplateContent>;

  try {
    content = parseTemplateContent(template.content);
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : "Invalid template",
    });
  }

  const columns = content.columns?.length ? content.columns : undefined;

  // Proyecto, columnas, epicas y arbol en una sola transaccion: si una tarea
  // falla, no queda nada, y los avisos de las tareas solo salen al confirmar.
  const { project, afterCommit } = await db.transaction(async (tx) => {
    const created = await insertProject(
      tx,
      { workspaceId, name, icon, slug },
      columns,
    );

    if (!created) {
      throw new HTTPException(500, { message: "Could not create the project" });
    }

    if (content.epics?.length) {
      await tx.insert(epicTable).values(
        content.epics.map((epic, index) => ({
          projectId: created.id,
          name: epic.name,
          color: epic.color,
          position: index + 1,
        })),
      );
    }

    const applied = await applyTaskTemplateInTransaction(tx, {
      templateId,
      projectId: created.id,
      currentUserId,
    });

    return { project: created, afterCommit: applied.afterCommit };
  });

  await afterCommit();

  return project;
}

import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { epicTable, projectTable, templateTable } from "../../database/schema";
import { insertProject } from "../../project/controllers/create-project";
import { parseTemplateContent } from "../content";
import { applyTaskTemplate } from "./apply-template";

/**
 * Crea un proyecto entero a partir de una plantilla: con **sus** columnas (las
 * cuatro de siempre si la plantilla no trae), sus epicas y su arbol de tareas.
 *
 * Aplicar una plantilla a un proyecto que ya existe solo despliega el arbol
 * (ADR 027); esto cierra el hueco de empezar de cero. El arbol se despliega con
 * `applyTaskTemplate`, que comprueba la profundidad y los campos antes de crear
 * nada. Si aun asi falla, el proyecto recien creado se borra: no queda un
 * proyecto vacio que nadie pidio a medias. Lo que no se deshace son los
 * `task.created` de las tareas que si llegaron a crearse (actividad, avisos,
 * webhooks): solo pasa si la base falla a mitad, y se acepta a sabiendas.
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

  const project = await db.transaction(async (tx) => {
    const created = await insertProject(
      tx,
      { workspaceId, name, icon, slug },
      columns,
    );

    if (created && content.epics?.length) {
      await tx.insert(epicTable).values(
        content.epics.map((epic, index) => ({
          projectId: created.id,
          name: epic.name,
          color: epic.color,
          position: index + 1,
        })),
      );
    }

    return created;
  });

  if (!project) {
    throw new HTTPException(500, { message: "Could not create the project" });
  }

  try {
    await applyTaskTemplate({
      templateId,
      projectId: project.id,
      currentUserId,
    });
  } catch (error) {
    await db.delete(projectTable).where(eq(projectTable.id, project.id));
    throw error;
  }

  return project;
}

import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { labelTable } from "../../database/schema";

async function updateLabel(id: string, name: string, color: string) {
  return db.transaction(async (tx) => {
    const label = await tx.query.labelTable.findFirst({
      where: (label, { eq }) => eq(label.id, id),
    });

    if (!label) {
      throw new HTTPException(404, {
        message: "Label not found",
      });
    }

    const isDefinition = !label.taskId && Boolean(label.workspaceId);
    const renamed = name !== label.name;

    // Dos etiquetas del espacio, o dos de la misma tarea, no pueden llamarse
    // igual: antes lo decia la base con un 500. Fusionarlas en silencio
    // juntaria dos etiquetas que alguien creo distintas, asi que se avisa.
    if (renamed) {
      const clash = await tx.query.labelTable.findFirst({
        where: and(
          ne(labelTable.id, id),
          eq(labelTable.name, name),
          label.taskId
            ? eq(labelTable.taskId, label.taskId)
            : and(
                eq(labelTable.workspaceId, label.workspaceId ?? ""),
                isNull(labelTable.taskId),
              ),
        ),
      });
      if (clash) {
        throw new HTTPException(409, {
          message: `A label named "${name}" already exists`,
        });
      }
    }

    const [updatedLabel] = await tx
      .update(labelTable)
      .set({ name, color })
      .where(eq(labelTable.id, id))
      .returning();

    // If this is a workspace-level label, cascade the changes to all
    // task-level copies so existing label assignments reflect the new color/name
    if (isDefinition && label.workspaceId) {
      const sameWorkspaceCopies = and(
        eq(labelTable.workspaceId, label.workspaceId),
        isNotNull(labelTable.taskId),
      );

      if (renamed) {
        // Una tarea que ya lleva una copia con el nombre nuevo se queda con
        // esa: la vieja se quita en vez de chocar con `label_task_name_unique`.
        const alreadyNamed = tx
          .select({ taskId: labelTable.taskId })
          .from(labelTable)
          .where(and(sameWorkspaceCopies, eq(labelTable.name, name)));
        await tx
          .delete(labelTable)
          .where(
            and(
              sameWorkspaceCopies,
              eq(labelTable.name, label.name),
              inArray(labelTable.taskId, alreadyNamed),
            ),
          );
      }

      await tx
        .update(labelTable)
        .set({ name, color })
        .where(
          and(
            sameWorkspaceCopies,
            inArray(labelTable.name, [label.name, name]),
          ),
        );
    }

    return updatedLabel;
  });
}

export default updateLabel;

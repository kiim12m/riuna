import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable } from "../../database/schema";

async function updateColumn(
  id: string,
  data: {
    name?: string;
    icon?: string | null;
    color?: string | null;
    isFinal?: boolean;
  },
) {
  const existing = await db.query.columnTable.findFirst({
    where: eq(columnTable.id, id),
  });

  if (!existing) {
    throw new HTTPException(404, { message: "Column not found" });
  }

  const finalChanged =
    data.isFinal !== undefined && data.isFinal !== existing.isFinal;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(columnTable)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.isFinal !== undefined && { isFinal: data.isFinal }),
      })
      .where(eq(columnTable.id, id))
      .returning();

    if (!row) {
      throw new HTTPException(500, { message: "Failed to update column" });
    }

    // Marcar o desmarcar una columna como final cambia que tareas cuentan como
    // terminadas, pero `completed_at` ya esta escrito: sin esto, las tareas que
    // estaban en esa columna se quedan con la fecha vieja —o sin ninguna— hasta
    // el siguiente cambio de estado.
    //
    // Era el riesgo declarado de la ADR 025 y era invisible mientras nadie
    // leyera esa fecha; con los paneles de la Fase 7 leyendola es una grafica
    // que miente. La reparacion es la que la propia ADR prescribe: una escritura
    // que no cambia nada y deja que el disparador recalcule.
    //
    // Va como SQL suelto y no por `tx.update(taskTable)`: el `$onUpdate` de
    // drizzle tocaria `updated_at` de todas las tareas del proyecto, que las
    // dejaria a todas como recien modificadas por un cambio que no es suyo.
    if (finalChanged) {
      // **No sirve `SET status = status`**, que es lo que prescribia la
      // ADR 025: el disparador corta por lo sano justo cuando `status` no
      // cambia —lo que evita que un arrastre dentro de la misma columna pague
      // una consulta—, asi que se saltaba el recalculo entero.
      //
      // Se recalcula aqui con la **misma** funcion que usa el disparador
      // (`task_status_is_final`, migracion 0056), para que la regla siga
      // viviendo en un solo sitio y no en un cuarto.
      await tx.execute(sql`
        UPDATE "task" SET "completed_at" = CASE
          WHEN task_status_is_final("project_id", "status")
            THEN COALESCE("completed_at", now())
          ELSE NULL
        END
        WHERE "project_id" = ${row.projectId}
      `);
    }

    return row;
  });

  return updated;
}

export default updateColumn;

import { and, eq, sql } from "drizzle-orm";
import db from "../database";
import { projectTable, taskRecurrenceTable } from "../database/schema";
import {
  firstOnOrAfter,
  nextOccurrence,
  parseCadence,
} from "../recurrence/cadence";
import { parseTemplate } from "../recurrence/template";

export type PlanGhost = {
  recurrenceId: string;
  title: string;
  estimate: number | null;
  plannedDate: Date;
};

/**
 * Las ocurrencias que el generador de recurrencias crearia dentro de la
 * ventana, sin crear nada: encadena `firstOnOrAfter`/`nextOccurrence`
 * (`recurrence/cadence.ts`), las mismas funciones puras que usa el generador
 * real, asi que la fecha proyectada es exactamente la que tocaria de verdad.
 *
 * Filtra por `template->>'assigneeId'` porque el plan personal es de quien
 * haria la tarea, no de quien creo la recurrencia. Una recurrencia sin
 * responsable asignado no genera ningun fantasma: nadie la veria en su
 * Planificador y tampoco aparece en el de nadie por descarte.
 *
 * Proyecta desde `max(windowStart, nextRunAt)` y corta en `endsAt`.
 * `nextRunAt` es el contrato del generador (`generate.ts`): la proxima
 * ocurrencia que todavia no existe. Todo lo anterior o ya se creo, o el
 * generador lo salto con `advancePast` y no lo va a crear nunca — proyectarlo
 * de todos modos duplicaria una tarea ya generada. Una recurrencia cuyo
 * `endsAt` ya paso no debe seguir proyectando fantasmas hasta que el
 * generador corra y la desactive.
 */
export async function computeGhosts(
  workspaceId: string,
  userId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<PlanGhost[]> {
  const rows = await db
    .select({
      id: taskRecurrenceTable.id,
      template: taskRecurrenceTable.template,
      cadence: taskRecurrenceTable.cadence,
      nextRunAt: taskRecurrenceTable.nextRunAt,
      endsAt: taskRecurrenceTable.endsAt,
    })
    .from(taskRecurrenceTable)
    .innerJoin(projectTable, eq(taskRecurrenceTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        eq(taskRecurrenceTable.active, true),
        sql`${taskRecurrenceTable.template}->>'assigneeId' = ${userId}`,
      ),
    );

  const ghosts: PlanGhost[] = [];

  for (const row of rows) {
    // Una fila corrupta no debe tumbar la ventana entera de quien mira.
    try {
      const template = parseTemplate(row.template);
      const cadence = parseCadence(row.cadence);

      const projectionStart =
        row.nextRunAt > windowStart ? row.nextRunAt : windowStart;
      const projectionEnd =
        row.endsAt && row.endsAt < windowEnd ? row.endsAt : windowEnd;

      let cursor = firstOnOrAfter(cadence, projectionStart);
      while (cursor <= projectionEnd) {
        ghosts.push({
          recurrenceId: row.id,
          title: template.title,
          estimate: template.estimate ?? null,
          plannedDate: cursor,
        });
        cursor = nextOccurrence(cadence, cursor);
      }
    } catch {
      // Ignorada: la CHECK de la tabla ya impide la mayoria de formas rotas,
      // esto es solo para no depender de esa garantia aqui tambien.
    }
  }

  return ghosts;
}

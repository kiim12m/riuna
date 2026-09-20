import { and, eq, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { taskRecurrenceTable, taskTable } from "../database/schema";
import createTask from "../task/controllers/create-task";
import { advancePast, parseCadence } from "./cadence";
import { assertTemplateUsable, parseTemplate } from "./template";

type DueRecurrence = typeof taskRecurrenceTable.$inferSelect;

/** Las recurrencias que ya tocan. Servido por `task_recurrence_due_idx`. */
async function getDueRecurrences(now: Date): Promise<DueRecurrence[]> {
  return db
    .select()
    .from(taskRecurrenceTable)
    .where(
      and(
        eq(taskRecurrenceTable.active, true),
        lte(taskRecurrenceTable.nextRunAt, now),
      ),
    );
}

/**
 * Que el error venga de una comprobacion y no de la infraestructura: los
 * `assert*` de la plantilla lanzan 400, 403 o 404. Un 5xx, o cualquier otra
 * excepcion, es un fallo pasajero.
 */
function isRejection(error: unknown): boolean {
  return error instanceof HTTPException && error.status < 500;
}

async function disable(recurrenceId: string, reason: string, error: unknown) {
  console.error(reason, { recurrenceId, error });
  await db
    .update(taskRecurrenceTable)
    .set({ active: false })
    .where(eq(taskRecurrenceTable.id, recurrenceId));
}

/**
 * Genera una ocurrencia.
 *
 * **Primero se reclama la fecha, despues se crea la tarea**, y la reclamacion
 * es condicional (`WHERE next_run_at = <la que se leyo>`). Si otro proceso se
 * adelanto, el UPDATE no casa ninguna fila y este se retira sin crear nada.
 *
 * El orden importa y es deliberado: si la creacion falla despues de reclamar,
 * se pierde **una** ocurrencia. Al reves —crear y luego reclamar— un fallo al
 * avanzar la fecha dejaria la recurrencia disparando la misma tarea en cada
 * vuelta del planificador. Para una tarea recurrente, perder una es un
 * inconveniente y duplicar sin freno es un destrozo.
 */
async function runOne(
  recurrence: DueRecurrence,
  now: Date,
): Promise<"created" | "skipped" | "finished" | "failed"> {
  let cadence: ReturnType<typeof parseCadence>;
  let template: ReturnType<typeof parseTemplate>;

  try {
    cadence = parseCadence(recurrence.cadence);
    template = parseTemplate(recurrence.template);
  } catch (error) {
    // Una fila invalida se apaga en vez de reintentarse cada cinco minutos
    // para siempre.
    await disable(recurrence.id, "Disabling an invalid recurrence", error);
    return "failed";
  }

  try {
    await assertTemplateUsable(template, recurrence.projectId);
  } catch (error) {
    // Un estado, responsable o equipo que el proyecto ya no admite haria
    // fallar cada ocurrencia despues de reclamarla, y se perderian todas sin
    // ruido. Se apaga **antes** de reclamar, igual que una fila ilegible.
    //
    // Pero solo si la plantilla es el problema: a diferencia de leerla, esta
    // comprobacion consulta la base, y apagar por un corte de conexion o un
    // pool agotado dejaria apagadas para siempre todas las recurrencias de esa
    // vuelta. Lo demas se reporta como degradado y se reintenta en la
    // siguiente, dentro de cinco minutos.
    if (!isRejection(error)) {
      console.error("Could not check a recurrence template", {
        recurrenceId: recurrence.id,
        error,
      });
      return "failed";
    }

    await disable(
      recurrence.id,
      "Disabling a recurrence the project no longer accepts",
      error,
    );
    return "failed";
  }

  const { nextRunAt } = advancePast(cadence, recurrence.nextRunAt, now);
  const exhausted = recurrence.endsAt !== null && nextRunAt > recurrence.endsAt;

  const claimed = await db
    .update(taskRecurrenceTable)
    .set({
      nextRunAt,
      lastRunAt: now,
      active: exhausted ? false : recurrence.active,
    })
    .where(
      and(
        eq(taskRecurrenceTable.id, recurrence.id),
        eq(taskRecurrenceTable.nextRunAt, recurrence.nextRunAt),
      ),
    )
    .returning({ id: taskRecurrenceTable.id });

  if (claimed.length === 0) return "skipped";

  const created = await createTask({
    projectId: recurrence.projectId,
    currentUserId: recurrence.createdBy ?? "",
    userId: template.assigneeId ?? undefined,
    title: template.title,
    status: template.status ?? "to-do",
    description: template.description,
    priority: template.priority,
    estimate: template.estimate,
    dueDate: recurrence.nextRunAt,
  });

  await db
    .update(taskTable)
    .set({
      recurrenceId: recurrence.id,
      teamId: template.teamId ?? null,
    })
    .where(eq(taskTable.id, created.id));

  return exhausted ? "finished" : "created";
}

/**
 * El paso del planificador.
 *
 * Devuelve `degraded` para que el registro de Sentry distinga "ha corrido y
 * algo ha fallado por el camino" de "ha corrido bien", que es lo que
 * `withCheckIn` espera y lo que el resto de trabajos del repo ya hacen.
 */
export async function generateRecurringTasks(): Promise<{ degraded: boolean }> {
  const now = new Date();
  let degraded = false;

  let due: DueRecurrence[];

  try {
    due = await getDueRecurrences(now);
  } catch (error) {
    console.error("Failed to read the due recurrences", error);
    return { degraded: true };
  }

  for (const recurrence of due) {
    try {
      const outcome = await runOne(recurrence, now);
      if (outcome === "failed") degraded = true;
    } catch (error) {
      // Una recurrencia rota no puede llevarse por delante a las demas.
      degraded = true;
      console.error("Failed to generate a recurring task", {
        recurrenceId: recurrence.id,
        error,
      });
    }
  }

  return { degraded };
}

/** Cuantas tareas ha generado ya una recurrencia. Para el listado. */
export function countGeneratedTasks() {
  return sql<number>`(
    SELECT COUNT(*)::int FROM "task" t
    WHERE t."recurrence_id" = "task_recurrence"."id"
  )`;
}

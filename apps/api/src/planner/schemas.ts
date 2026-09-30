import * as v from "valibot";

/**
 * La forma de una tarea personal, compartida por el Planificador y Hoy
 * (ADR 046): las dos son lecturas sobre `my-work/decorate.ts` con las mismas
 * columnas de tarea y proyecto.
 */
export const planTaskSchema = v.object({
  id: v.string(),
  number: v.number(),
  title: v.string(),
  status: v.string(),
  priority: v.string(),
  estimate: v.nullable(v.number()),
  dueDate: v.nullable(v.date()),
  projectId: v.string(),
  projectName: v.string(),
  projectSlug: v.string(),
  projectIcon: v.nullable(v.string()),
  teamId: v.nullable(v.string()),
  teamName: v.nullable(v.string()),
  statusColumn: v.nullable(
    v.object({
      slug: v.string(),
      name: v.string(),
      icon: v.nullable(v.string()),
      isFinal: v.boolean(),
    }),
  ),
  isDone: v.boolean(),
  labels: v.array(
    v.object({ id: v.string(), name: v.string(), color: v.string() }),
  ),
  assignees: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      image: v.nullable(v.string()),
    }),
  ),
});

/** Una fila de `personal_plan_entry` decorada: `entries`/`previous` de los dos. */
export const planEntrySchema = v.object({
  ...planTaskSchema.entries,
  plannedDate: v.date(),
  position: v.number(),
  /** `null`: sin hora, se reparte en el primer hueco libre del Cronograma. */
  startMinute: v.nullable(v.number()),
  /** Suma de `time_entry` cerradas de la tarea (ADR 045). */
  loggedSeconds: v.number(),
});

/** Vence dentro de la ventana, planificada o no. */
export const planDeadlineSchema = v.object({
  ...planTaskSchema.entries,
  /** `null`: vence en la ventana pero no esta planificada. */
  plannedDate: v.nullable(v.date()),
});

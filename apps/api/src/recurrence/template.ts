import { VALID_PRIORITIES } from "../task/validate-task-fields";

export type RecurrenceTemplate = {
  title: string;
  description?: string;
  priority?: string;
  estimate?: number | null;
  assigneeId?: string | null;
  teamId?: string | null;
  status?: string;
};

/**
 * La plantilla vive en un `jsonb`, asi que —igual que la cadencia— esta funcion
 * es lo unico que impide que llegue algo que luego reviente al generar la tarea
 * dentro de un trabajo programado, donde no hay nadie mirando.
 */
export function parseTemplate(value: unknown): RecurrenceTemplate {
  if (typeof value !== "object" || value === null) {
    throw new Error("The template must be an object");
  }

  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";

  if (!title) {
    throw new Error("The recurring task needs a title");
  }

  if (title.length > 500) {
    throw new Error("The title is too long");
  }

  const priority =
    typeof raw.priority === "string" ? raw.priority : "no-priority";

  if (!(VALID_PRIORITIES as readonly string[]).includes(priority)) {
    throw new Error(`Unknown priority: ${priority}`);
  }

  const estimate =
    raw.estimate === null || raw.estimate === undefined
      ? null
      : Number(raw.estimate);

  if (
    estimate !== null &&
    (!Number.isInteger(estimate) || estimate < 0 || estimate > 2_147_483_647)
  ) {
    throw new Error(
      "The estimate must be a non-negative whole number of seconds",
    );
  }

  return {
    title,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    priority,
    estimate,
    assigneeId: typeof raw.assigneeId === "string" ? raw.assigneeId : null,
    teamId: typeof raw.teamId === "string" ? raw.teamId : null,
    status: typeof raw.status === "string" ? raw.status : undefined,
  };
}

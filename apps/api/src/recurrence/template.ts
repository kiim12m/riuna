import {
  assertValidTaskStatus,
  VALID_PRIORITIES,
} from "../task/validate-task-fields";
import { checkTemplateFits } from "../template/check-template";
import { parseTaskExtras } from "../template/content";
import { assertAssignableTeam } from "../utils/assert-assignable-team";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../utils/assert-assignable-user";

export type RecurrenceTemplate = {
  title: string;
  description?: string;
  priority?: string;
  estimate?: number | null;
  assigneeId?: string | null;
  teamId?: string | null;
  status?: string;
  /** Etiquetas, epicas por nombre y campos personalizados (ADR 026, ADR 027). */
  labels?: Array<{ name: string; color: string }>;
  epics?: string[];
  customFields?: Record<string, unknown>;
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
    ...parseTaskExtras(raw),
  };
}

/**
 * Lo que `parseTemplate` no puede comprobar sin la base: que el estado sea una
 * columna del proyecto y que responsable y equipo sean de su espacio de
 * trabajo. Lanza el mismo `HTTPException` que la creacion normal de tareas.
 *
 * Se llama al guardar la recurrencia y otra vez antes de cada ocurrencia,
 * porque entre medias alguien puede borrar la columna o sacar a esa persona
 * del espacio. Sin la segunda, una plantilla que dejo de valer fallaba en cada
 * ocurrencia y las perdia todas en silencio.
 */
export async function assertTemplateUsable(
  template: RecurrenceTemplate,
  projectId: string,
): Promise<{ customFields?: Record<string, unknown> }> {
  await assertValidTaskStatus(template.status ?? "to-do", projectId);

  const workspaceId = await getProjectWorkspaceId(projectId);
  if (template.assigneeId) {
    await assertAssignableUser(template.assigneeId, workspaceId);
  }
  if (template.teamId) {
    await assertAssignableTeam(template.teamId, workspaceId);
  }

  // Los campos personalizados, como en una plantilla de tarea: una clave que el
  // proyecto ya no define se descarta, y un valor que no casa con su tipo es un
  // 400 -que aqui apaga la recurrencia antes de reclamar la fecha-.
  if (!template.customFields) return {};
  const node = { title: template.title, customFields: template.customFields };
  const fields = await checkTemplateFits([node], projectId, workspaceId);
  return { customFields: fields.get(node) };
}

import { VALID_PRIORITIES } from "../task/validate-task-fields";

export type TemplateNode = {
  title: string;
  description?: string;
  priority?: string;
  estimate?: number | null;
  status?: string;
  labels?: Array<{ name: string; color: string }>;
  epics?: string[];
  customFields?: Record<string, unknown>;
  children?: TemplateNode[];
};

export type TemplateContent = {
  columns?: Array<{
    name: string;
    slug: string;
    position: number;
    isFinal: boolean;
  }>;
  epics?: Array<{ name: string; color: string | null }>;
  tasks: TemplateNode[];
};

/**
 * Topes deliberados. Una plantilla se lee entera en memoria y se despliega
 * tarea a tarea, asi que sin limites una plantilla absurda seria un ataque por
 * agotamiento contra la propia instancia.
 */
export const MAX_TEMPLATE_TASKS = 500;
export const MAX_TEMPLATE_DEPTH = 10;

/**
 * Lo que una plantilla de tarea o de recurrencia puede llevar ademas de los
 * campos de base: etiquetas, epicas (por nombre) y campos personalizados. Un
 * solo sitio que lo lee, para que las dos plantillas no se diferencien.
 */
export function parseTaskExtras(raw: Record<string, unknown>): {
  labels?: Array<{ name: string; color: string }>;
  epics?: string[];
  customFields?: Record<string, unknown>;
} {
  const labels = Array.isArray(raw.labels)
    ? raw.labels.flatMap((label) => {
        if (typeof label !== "object" || label === null) return [];
        const entry = label as Record<string, unknown>;
        const name = typeof entry.name === "string" ? entry.name.trim() : "";
        if (!name) return [];
        return [
          {
            name,
            color: typeof entry.color === "string" ? entry.color : "#6b7280",
          },
        ];
      })
    : undefined;

  const epics = Array.isArray(raw.epics)
    ? raw.epics.filter(
        (epic): epic is string =>
          typeof epic === "string" && epic.trim() !== "",
      )
    : undefined;

  return {
    labels,
    epics,
    customFields:
      typeof raw.customFields === "object" &&
      raw.customFields !== null &&
      !Array.isArray(raw.customFields)
        ? (raw.customFields as Record<string, unknown>)
        : undefined,
  };
}

function parseNode(
  value: unknown,
  depth: number,
  counter: { count: number },
): TemplateNode {
  if (typeof value !== "object" || value === null) {
    throw new Error("Every template task must be an object");
  }

  if (depth > MAX_TEMPLATE_DEPTH) {
    throw new Error(`The template is deeper than ${MAX_TEMPLATE_DEPTH} levels`);
  }

  counter.count += 1;

  if (counter.count > MAX_TEMPLATE_TASKS) {
    throw new Error(
      `A template cannot hold more than ${MAX_TEMPLATE_TASKS} tasks`,
    );
  }

  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";

  if (!title) throw new Error("Every template task needs a title");

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

  const extras = parseTaskExtras(raw);

  const children = Array.isArray(raw.children)
    ? raw.children.map((child) => parseNode(child, depth + 1, counter))
    : undefined;

  return {
    title,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    priority,
    estimate,
    status: typeof raw.status === "string" ? raw.status : undefined,
    ...extras,
    children,
  };
}

/**
 * El contenido vive en un `jsonb`, asi que esta funcion es lo unico que impide
 * que una plantilla corrupta llegue al desplegador —que crea tareas de verdad—.
 */
export function parseTemplateContent(value: unknown): TemplateContent {
  if (typeof value !== "object" || value === null) {
    throw new Error("The template content must be an object");
  }

  const raw = value as Record<string, unknown>;
  const counter = { count: 0 };

  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map((task) => parseNode(task, 1, counter))
    : [];

  const columns = Array.isArray(raw.columns)
    ? raw.columns.flatMap((column, index) => {
        if (typeof column !== "object" || column === null) return [];
        const entry = column as Record<string, unknown>;
        const name = typeof entry.name === "string" ? entry.name.trim() : "";
        const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
        if (!name || !slug) return [];
        return [
          {
            name,
            slug,
            position: Number(entry.position ?? index),
            isFinal: entry.isFinal === true,
          },
        ];
      })
    : undefined;

  const epics = Array.isArray(raw.epics)
    ? raw.epics.flatMap((epic) => {
        if (typeof epic !== "object" || epic === null) return [];
        const entry = epic as Record<string, unknown>;
        const name = typeof entry.name === "string" ? entry.name.trim() : "";
        if (!name) return [];
        return [
          { name, color: typeof entry.color === "string" ? entry.color : null },
        ];
      })
    : undefined;

  return { columns, epics, tasks };
}

/** La profundidad del arbol de la plantilla, en niveles. */
export function templateDepth(nodes: TemplateNode[]): number {
  if (nodes.length === 0) return 0;
  return (
    1 + Math.max(0, ...nodes.map((node) => templateDepth(node.children ?? [])))
  );
}

/** Cuantas tareas trae en total, contando toda la jerarquia. */
export function countTemplateTasks(nodes: TemplateNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countTemplateTasks(node.children ?? []),
    0,
  );
}

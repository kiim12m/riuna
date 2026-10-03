import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { TaskFilter } from "@/types/task-filter";

export type PersonalScope = "assigned" | "team";

/** Los dos numeros de la barra lateral: "Hoy" y "Mis tareas" (ADR 046). */
export async function getMyWorkCounts(workspaceId: string) {
  const response = await client["my-work"].counts.$get({
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

/**
 * «Esperando a» (sub-bloque 1.4): lo que delegue y sigue abierto, y lo mio
 * bloqueado por tareas ajenas. Cada lista, topada en 100.
 */
export async function getWaiting(workspaceId: string) {
  const response = await client["my-work"].waiting.$get({
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type WaitingResponse = Awaited<ReturnType<typeof getWaiting>>;

// El mismo vocabulario que `SEARCH_SORT_FIELDS` en la API. Sin `number` ni
// `position`: se numeran por proyecto, y ordenar por ellos entre proyectos no
// significa nada (misma razon que ADR 038 los retira del registro).
export type SearchSortField =
  | "smart"
  | "dueDate"
  | "startDate"
  | "priority"
  | "title"
  | "createdAt"
  | "updatedAt"
  | "project";

export type SearchMyWorkOptions = {
  workspaceId: string;
  scope: PersonalScope;
  projectId?: string;
  filter?: TaskFilter | null;
  includeDone?: boolean;
  sortBy?: SearchSortField;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export async function searchMyWork({
  workspaceId,
  scope,
  projectId,
  filter,
  includeDone = false,
  sortBy = "smart",
  sortOrder = "asc",
  page = 1,
  limit = 100,
}: SearchMyWorkOptions) {
  const response = await client["my-work"].tasks.search.$get({
    query: {
      workspaceId,
      scope,
      ...(projectId ? { projectId } : {}),
      // El filtro viaja como JSON en la cadena de consulta; el servidor lo
      // valida y responde 400 si no encaja (ver `get-tasks.ts`).
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
      includeDone: includeDone ? "true" : "false",
      sortBy,
      sortOrder,
      page: String(page),
      limit: String(limit),
    },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type MyWorkTask = Awaited<
  ReturnType<typeof searchMyWork>
>["tasks"][number];

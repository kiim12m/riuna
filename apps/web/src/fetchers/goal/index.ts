import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { EditableCondition } from "@/types/task-filter";

async function unwrap<T>(response: {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }
  return response.json();
}

/**
 * Un resultado clave se configura como un widget **menos la agrupacion**: es un
 * numero, no un reparto. `sumLogged` queda fuera porque mide sobre el registro
 * de tiempo y no sobre el cierre, asi que el periodo significaria otra cosa; y
 * `count` y `doneRatio` tampoco, porque sobre una ventana de cierre median lo
 * mismo que `doneCount` (ADR 032).
 */
export type GoalMetric = "doneCount" | "sumEstimate";

export type TargetConfig = {
  filter?: EditableCondition[];
  scope?: "assigned" | "team";
  metric?: GoalMetric;
};

export async function getGoals(workspaceId: string) {
  return unwrap(await client.goal.$get({ query: { workspaceId } }));
}

export async function createGoal(payload: {
  workspaceId: string;
  name: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
}) {
  return unwrap(await client.goal.$post({ json: payload }));
}

export async function updateGoal(
  id: string,
  payload: {
    name?: string;
    description?: string | null;
    startsAt?: string;
    endsAt?: string;
    isShared?: boolean;
  },
) {
  return unwrap(
    await client.goal[":id"].$patch({ param: { id }, json: payload }),
  );
}

export async function deleteGoal(id: string) {
  return unwrap(await client.goal[":id"].$delete({ param: { id } }));
}

export async function createTarget(
  goalId: string,
  payload: {
    name: string;
    targetValue: number;
    projectId?: string | null;
    config?: TargetConfig;
  },
) {
  return unwrap(
    await client.goal[":id"].target.$post({
      param: { id: goalId },
      json: payload,
    }),
  );
}

export async function updateTarget(
  id: string,
  payload: {
    name?: string;
    targetValue?: number;
    projectId?: string | null;
    config?: TargetConfig;
  },
) {
  return unwrap(
    await client.goal.target[":id"].$patch({ param: { id }, json: payload }),
  );
}

export async function deleteTarget(id: string) {
  return unwrap(await client.goal.target[":id"].$delete({ param: { id } }));
}

export type Goal = Awaited<ReturnType<typeof getGoals>>[number];
export type GoalTarget = Goal["targets"][number];

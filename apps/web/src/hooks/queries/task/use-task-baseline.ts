import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import getTaskBaseline from "@/fetchers/task/get-task-baseline";
import type { TaskQueryOptions } from "@/fetchers/task/get-tasks";
import { useHolidays } from "@/hooks/queries/availability/use-availability";
import { type BaselineChoice, baselineMoment } from "@/lib/baseline";
import { dayKey } from "@/lib/day-key";
import type { TaskFilter } from "@/types/task-filter";

/**
 * La linea base de una vista (ADR 085). Como los totales, fuera de
 * `["tasks"]` y con `listUpdatedAt` en la clave: cuando la vista se pone al
 * dia, la comparacion tambien.
 */
export function useTaskBaseline({
  projectId,
  workspaceId,
  choice,
  filter,
  options,
  listUpdatedAt,
}: {
  projectId: string;
  workspaceId: string;
  choice: BaselineChoice | undefined;
  filter: TaskFilter | null | undefined;
  options?: TaskQueryOptions;
  listUpdatedAt: number;
}) {
  const { data: holidays, isPending: holidaysPending } =
    useHolidays(workspaceId);
  const todayKey = dayKey(new Date());
  const at = useMemo(() => {
    if (!choice) return null;
    const keys = new Set(
      (holidays ?? []).map((holiday) => dayKey(new Date(holiday.day))),
    );
    return baselineMoment(choice, todayKey, keys);
  }, [choice, holidays, todayKey]);

  const query = useQuery({
    queryKey: [
      "task-baseline",
      projectId,
      at,
      filter ? JSON.stringify(filter) : null,
      options?.treeScope ?? "matching",
      options?.includeSubprojects ? "subprojects" : null,
      listUpdatedAt,
    ],
    queryFn: () => getTaskBaseline(projectId, at as string, filter, options),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === projectId &&
      previousQuery?.queryKey[2] === at
        ? previous
        : undefined,
    // «El ultimo dia laborable» depende de los festivos: se espera a tenerlos.
    enabled:
      Boolean(projectId) &&
      at !== null &&
      listUpdatedAt > 0 &&
      !(choice === "lastWorkDay" && holidaysPending),
  });

  return { ...query, at };
}

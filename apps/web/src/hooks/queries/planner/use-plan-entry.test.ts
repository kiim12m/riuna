import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { planEntryQueryKey } from "./use-plan-entry";

/**
 * Revision de codigo del interludio, hallazgo 7: «Planificada: lun 6» del
 * detalle no se actualizaba al mover la tarea, porque su clave no colgaba
 * del prefijo `["planner", workspaceId]` que invalidan Hoy, el Cronograma,
 * completar una tarea y el propio Planificador.
 */
describe("planEntryQueryKey", () => {
  it("is invalidated with the rest of the workspace's planner", async () => {
    const queryClient = new QueryClient();
    const key = planEntryQueryKey("ws-1", "task-1");
    queryClient.setQueryData(key, { entry: null });

    await queryClient.invalidateQueries({ queryKey: ["planner", "ws-1"] });

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });
});

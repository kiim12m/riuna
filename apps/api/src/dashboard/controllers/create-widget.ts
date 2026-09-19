import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  dashboardWidgetTable,
  goalTable,
  projectTable,
} from "../../database/schema";
import {
  MAX_WIDGETS_PER_DASHBOARD,
  resolveWidget,
  type WidgetConfig,
  type WidgetType,
} from "../widget-config";

export default async function createWidget({
  dashboardId,
  workspaceId,
  type,
  title,
  projectId,
  goalId,
  config,
  span,
}: {
  dashboardId: string;
  workspaceId: string;
  type: WidgetType;
  title: string;
  projectId?: string | null;
  goalId?: string | null;
  config: WidgetConfig;
  span?: number;
}) {
  await assertProjectBelongsToWorkspace(projectId, workspaceId);
  await assertGoalIsVisible(goalId, workspaceId, type);

  // Se resuelve al escribir para no guardar una combinacion que el agregado
  // rechazaria despues, dejando el panel roto en el consumidor.
  resolveWidget(type, config, projectId ?? null);

  const [existing] = await db
    .select({ value: count() })
    .from(dashboardWidgetTable)
    .where(eq(dashboardWidgetTable.dashboardId, dashboardId));

  const used = existing?.value ?? 0;

  if (used >= MAX_WIDGETS_PER_DASHBOARD) {
    throw new HTTPException(422, {
      message: `A dashboard holds at most ${MAX_WIDGETS_PER_DASHBOARD} widgets`,
    });
  }

  const [widget] = await db
    .insert(dashboardWidgetTable)
    .values({
      dashboardId,
      projectId: projectId ?? null,
      goalId: goalId ?? null,
      type,
      title,
      config,
      span: span ?? 1,
      position: used,
    })
    .returning();

  return widget;
}

/**
 * Un `project_id` de otro espacio no puede colarse.
 *
 * El agregado ya lo neutraliza —su ambito exige `project.workspace_id`, asi que
 * un id ajeno devuelve cero filas y no contenido de otro sitio—, pero fallar al
 * escribir dice **por que** en vez de dejar un widget que siempre sale vacio.
 */
export async function assertProjectBelongsToWorkspace(
  projectId: string | null | undefined,
  workspaceId: string,
) {
  if (!projectId) return;

  const [project] = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found in this workspace",
    });
  }
}

/**
 * Un widget de objetivo tiene que nombrar uno, y del mismo espacio.
 *
 * Se comprueba aqui y no solo con la clave ajena porque la clave permite
 * cualquier objetivo de cualquier espacio: sin esto, un id ajeno se guardaria y
 * el lote lo serviria a quien no le toca.
 */
export async function assertGoalIsVisible(
  goalId: string | null | undefined,
  workspaceId: string,
  type: string,
) {
  if (type !== "goal") return;

  if (!goalId) {
    throw new HTTPException(400, {
      message: "A goal widget needs a goal",
    });
  }

  const [goal] = await db
    .select({ id: goalTable.id })
    .from(goalTable)
    .where(
      and(eq(goalTable.id, goalId), eq(goalTable.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!goal) {
    throw new HTTPException(404, { message: "Goal not found" });
  }
}

import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { dashboardWidgetTable } from "../../database/schema";
import {
  resolveWidget,
  type WidgetConfig,
  type WidgetType,
} from "../widget-config";
import { assertProjectBelongsToWorkspace } from "./create-widget";

export default async function updateWidget({
  id,
  workspaceId,
  title,
  projectId,
  goalId,
  config,
  span,
}: {
  id: string;
  workspaceId: string;
  title?: string;
  projectId?: string | null;
  goalId?: string | null;
  config?: WidgetConfig;
  span?: number;
}) {
  const existing = await db.query.dashboardWidgetTable.findFirst({
    where: eq(dashboardWidgetTable.id, id),
  });

  if (!existing) {
    throw new HTTPException(404, { message: "Widget not found" });
  }

  const nextProjectId =
    projectId !== undefined ? projectId : existing.projectId;

  await assertProjectBelongsToWorkspace(nextProjectId, workspaceId);

  // Se revalida con la combinacion resultante y no solo con lo que llega:
  // quitarle el proyecto a un widget de epicas lo dejaria imposible de calcular.
  resolveWidget(
    existing.type as WidgetType,
    (config ?? existing.config) as WidgetConfig,
    nextProjectId,
  );

  const [widget] = await db
    .update(dashboardWidgetTable)
    .set({
      ...(title !== undefined && { title }),
      ...(projectId !== undefined && { projectId }),
      ...(goalId !== undefined && { goalId }),
      ...(config !== undefined && { config }),
      ...(span !== undefined && { span }),
    })
    .where(eq(dashboardWidgetTable.id, id))
    .returning();

  return widget;
}

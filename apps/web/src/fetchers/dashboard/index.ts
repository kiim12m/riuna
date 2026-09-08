import { client } from "@riuna/libs";
import { filenameFromResponse } from "@/lib/download-filename";
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

export type WidgetType =
  | "count"
  | "breakdown"
  | "trend"
  | "time"
  | "epic_progress"
  | "table"
  | "inbox"
  | "goal";

export type WidgetMetric =
  | "count"
  | "doneCount"
  | "doneRatio"
  | "sumEstimate"
  | "sumLogged";

export type WidgetGroupBy =
  | "project"
  | "assignee"
  | "priority"
  | "team"
  | "status"
  | "done"
  | "dueWindow"
  | "epic"
  | "time";

export type Granularity = "day" | "week" | "month";

/**
 * El mismo vocabulario editable que una vista guardada (ADR 015), reutilizado
 * tal cual: es lo que permite que una vista guardada alimente un widget mas
 * adelante sin conversion.
 */
export type WidgetCondition = EditableCondition;

export type WidgetConfig = {
  filter?: WidgetCondition[];
  metric?: WidgetMetric;
  groupBy?: WidgetGroupBy;
  granularity?: Granularity;
  rangeDays?: number;
};

export async function getDashboards(workspaceId: string) {
  return unwrap(await client.dashboard.$get({ query: { workspaceId } }));
}

export async function getDashboardData(id: string) {
  return unwrap(await client.dashboard[":id"].data.$post({ param: { id } }));
}

export async function createDashboard(input: {
  workspaceId: string;
  name: string;
}) {
  return unwrap(await client.dashboard.$post({ json: input }));
}

export async function updateDashboard(
  id: string,
  input: { name?: string; isShared?: boolean; position?: number },
) {
  return unwrap(
    await client.dashboard[":id"].$patch({ param: { id }, json: input }),
  );
}

export async function deleteDashboard(id: string) {
  return unwrap(await client.dashboard[":id"].$delete({ param: { id } }));
}

export async function createWidget(
  dashboardId: string,
  input: {
    type: WidgetType;
    title: string;
    projectId?: string | null;
    goalId?: string | null;
    config: WidgetConfig;
    span?: number;
  },
) {
  return unwrap(
    await client.dashboard[":id"].widget.$post({
      param: { id: dashboardId },
      json: input,
    }),
  );
}

export async function updateWidget(
  id: string,
  input: {
    title?: string;
    projectId?: string | null;
    goalId?: string | null;
    config?: WidgetConfig;
    span?: number;
  },
) {
  return unwrap(
    await client.dashboard.widget[":id"].$patch({ param: { id }, json: input }),
  );
}

export async function deleteWidget(id: string) {
  return unwrap(
    await client.dashboard.widget[":id"].$delete({ param: { id } }),
  );
}

export async function reorderWidgets(dashboardId: string, widgetIds: string[]) {
  return unwrap(
    await client.dashboard[":id"].widget.order.$put({
      param: { id: dashboardId },
      json: { widgetIds },
    }),
  );
}

export type Dashboard = Awaited<ReturnType<typeof getDashboards>>[number];
export type Widget = Dashboard["widgets"][number];
export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
export type WidgetPayload = DashboardData["widgets"][number];

/**
 * El panel como hoja de calculo, una hoja por widget.
 *
 * No pasa por `unwrap`: la respuesta es un fichero, no JSON.
 */
export async function exportDashboard(dashboardId: string) {
  const response = await client.dashboard[":id"].export.$get({
    param: { id: dashboardId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return {
    blob: await response.blob(),
    filename: filenameFromResponse(response, "panel.xlsx"),
  };
}

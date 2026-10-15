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
  | "goal"
  | "week";

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
  | "time"
  /** Solo en el widget de tiempo: el total, sin repartir. */
  | "none";

export type Granularity = "day" | "week" | "month";

/**
 * El mismo vocabulario que `WIDGET_DUE_WINDOWS` en la API: las cinco ventanas
 * de `utils/due-window.ts` mas `thisWeek`, la semana natural (ADR 093).
 */
export type WidgetDueWindow =
  | "overdue"
  | "today"
  | "week"
  | "thisWeek"
  | "later"
  | "none";

/**
 * El mismo vocabulario editable que una vista guardada (ADR 015), reutilizado
 * tal cual: es lo que permite que una vista guardada alimente un widget mas
 * adelante sin conversion.
 */
export type WidgetCondition = EditableCondition;

/**
 * El `config` de un widget, **espejo exacto** de `widgetConfigSchema` en la API.
 *
 * Tiene que estar completo, no solo lo que la interfaz edita: el editor siembra
 * su borrador desde este tipo y despues envia el objeto entero, asi que una
 * clave que falte aqui se **borra al guardar**. Es lo que pasaba con `scope`:
 * abrir y guardar cualquier widget sembrado le quitaba en silencio el ambito
 * personal y lo ensanchaba a todo el espacio de trabajo.
 */
export type WidgetConfig = {
  filter?: WidgetCondition[];
  scope?: "assigned" | "team";
  metric?: WidgetMetric;
  groupBy?: WidgetGroupBy;
  granularity?: Granularity;
  rangeDays?: number;
  dueWindow?: WidgetDueWindow;
};

export async function getDashboards(workspaceId: string) {
  return unwrap(await client.dashboard.$get({ query: { workspaceId } }));
}

/** Los siete valores que admite la ruta, tal cual viajan en la URL. */
const WEEK_START_PARAMS = ["0", "1", "2", "3", "4", "5", "6"] as const;

export async function getDashboardData(id: string, weekStartsOn: number) {
  return unwrap(
    await client.dashboard[":id"].data.$post({
      param: { id },
      // La preferencia de inicio de semana de quien mira: la ventana del widget
      // semanal la calcula el servidor, pero no puede adivinar donde empieza.
      query: { weekStartsOn: WEEK_START_PARAMS[weekStartsOn] },
    }),
  );
}

/**
 * Las tareas que cuenta una tarjeta de recuento, pagina a pagina (ADR 093). El
 * inicio de semana viaja por lo mismo que en `getDashboardData`: «Vencen esta
 * semana» acaba donde acaba la semana de quien mira.
 */
export async function getWidgetTasks(
  id: string,
  weekStartsOn: number,
  page: number,
) {
  return unwrap(
    await client.dashboard.widget[":id"].tasks.$get({
      param: { id },
      query: {
        weekStartsOn: WEEK_START_PARAMS[weekStartsOn],
        page: String(page),
      },
    }),
  );
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
    rowSpan?: number;
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
    rowSpan?: number;
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

/** Sustituye todos los widgets del panel por los de la distribucion de partida. */
export async function resetDashboardLayout(dashboardId: string) {
  return unwrap(
    await client.dashboard[":id"]["reset-layout"].$post({
      param: { id: dashboardId },
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
export async function exportDashboard(
  dashboardId: string,
  weekStartsOn: number,
) {
  const response = await client.dashboard[":id"].export.$get({
    param: { id: dashboardId },
    // La misma preferencia que la pantalla: sin ella la hoja de la semana
    // cubria siete dias distintos de los que se estaban viendo.
    query: { weekStartsOn: WEEK_START_PARAMS[weekStartsOn] },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return {
    blob: await response.blob(),
    filename: filenameFromResponse(response, "panel.xlsx"),
  };
}

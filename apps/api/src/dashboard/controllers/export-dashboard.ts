import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { dashboardTable, dashboardWidgetTable } from "../../database/schema";
import {
  buildExchangeWorkbookOf,
  type ExchangeSheet,
} from "../../task/exchange/build-file";
import type { WidgetConfig } from "../widget-config";
import getDashboardData from "./get-dashboard-data";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Excel no admite mas de 31 caracteres ni estos signos en el nombre de hoja. */
const FORBIDDEN_IN_SHEET_NAME = /[[\]:*?/\\]/g;
const MAX_SHEET_NAME = 31;

/**
 * El panel como informe de Excel: una hoja por widget.
 *
 * **Sale de `getDashboardData`, la misma lectura que pinta la pantalla.** No es
 * comodidad: es lo que garantiza que la hoja no pueda contradecir al panel. Es
 * el mismo criterio que "exportar la vista que estoy mirando" de la ADR 015,
 * donde la exportacion de tareas pasa por `getTasks` en vez de reimplementar el
 * filtrado.
 *
 * Solo xlsx. Un CSV es **una** tabla, y un panel son varias: ofrecerlo obligaria
 * a elegir un widget o a apilarlos en una hoja con las columnas descuadradas.
 */
export default async function exportDashboard(
  dashboardId: string,
  workspaceId: string,
  userId: string,
) {
  const [dashboard] = await db
    .select()
    .from(dashboardTable)
    .where(eq(dashboardTable.id, dashboardId))
    .limit(1);

  if (!dashboard) {
    throw new HTTPException(404, { message: "Dashboard not found" });
  }

  const widgets = await db
    .select()
    .from(dashboardWidgetTable)
    .where(eq(dashboardWidgetTable.dashboardId, dashboardId))
    .orderBy(asc(dashboardWidgetTable.position));

  const { widgets: payloads } = await getDashboardData(
    dashboardId,
    workspaceId,
    userId,
  );

  const byId = new Map(payloads.map((entry) => [entry.id, entry]));
  const used = new Set<string>();
  const sheets: ExchangeSheet[] = [];

  for (const widget of widgets) {
    // La bandeja la pinta el cliente con su propia consulta, asi que aqui no
    // hay nada que volcar.
    if (widget.type === "inbox") continue;

    const entry = byId.get(widget.id);
    const sheetName = uniqueSheetName(widget.title, used);

    if (!entry || "error" in entry) {
      sheets.push({
        sheetName,
        columns: [{ header: "Error", kind: "text", width: 60 }],
        // Un widget que no se pudo calcular deja constancia en su hoja en vez
        // de desaparecer del libro sin decir nada.
        rows: [
          { cells: [entry?.error ?? "This widget could not be computed"] },
        ],
      });
      continue;
    }

    sheets.push({ sheetName, ...sheetBody(widget, entry.data) });
  }

  if (sheets.length === 0) {
    throw new HTTPException(422, {
      message: "This dashboard has nothing to export",
    });
  }

  return {
    buffer: await buildExchangeWorkbookOf(sheets),
    filename: `${slugify(dashboard.name)}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
  };
}

type WidgetRow = typeof dashboardWidgetTable.$inferSelect;
type WidgetData = Extract<
  Awaited<ReturnType<typeof getDashboardData>>["widgets"][number],
  { data: unknown }
>["data"];

function sheetBody(
  widget: WidgetRow,
  data: WidgetData,
): Omit<ExchangeSheet, "sheetName"> {
  if (widget.type === "goal" && data.goal) {
    return {
      columns: [
        { header: "Resultado clave", kind: "text", width: 40 },
        { header: "Actual", kind: "number" },
        { header: "Diana", kind: "number" },
        { header: "Avance", kind: "text" },
      ],
      rows: data.goal.targets.map((target) => ({
        cells: [
          target.name,
          target.current,
          target.targetValue,
          target.current === null
            ? "—"
            : `${Math.min(Math.round((target.current / target.targetValue) * 100), 100)} %`,
        ],
      })),
    };
  }

  if (widget.type === "table") {
    return {
      columns: [
        { header: "Tarea", kind: "text", width: 50 },
        { header: "Proyecto", kind: "text", width: 24 },
        { header: "Prioridad", kind: "text" },
        { header: "Vencimiento", kind: "date" },
        { header: "Hecha", kind: "text" },
      ],
      rows: (data.rows ?? []).map((row) => ({
        cells: [
          row.title,
          row.projectName,
          row.priority,
          row.dueDate ?? null,
          row.isDone ? "Sí" : "No",
        ],
      })),
    };
  }

  // El resto son repartos: clave, valor y —cuando la metrica es una
  // proporcion— su denominador.
  const config = widget.config as WidgetConfig;
  const buckets = data.buckets ?? [];
  const withTotal = buckets.some((bucket) => bucket.total !== undefined);

  return {
    columns: [
      { header: labelHeader(config.groupBy), kind: "text", width: 32 },
      { header: "Valor", kind: "number" },
      ...(withTotal ? [{ header: "Total", kind: "number" as const }] : []),
    ],
    rows: buckets.map((bucket) => ({
      cells: [
        // La etiqueta resuelta, no el id: un informe con `cm3k9…` en la primera
        // columna no lo lee nadie.
        bucket.key === null
          ? "Sin valor"
          : (data.labels?.[bucket.key]?.label ?? bucket.key),
        bucket.value,
        ...(withTotal ? [bucket.total ?? null] : []),
      ],
    })),
  };
}

function labelHeader(groupBy: WidgetConfig["groupBy"]) {
  switch (groupBy) {
    case "project":
      return "Proyecto";
    case "assignee":
      return "Responsable";
    case "team":
      return "Equipo";
    case "priority":
      return "Prioridad";
    case "status":
      return "Estado";
    case "dueWindow":
      return "Vencimiento";
    case "epic":
      return "Épica";
    case "time":
      return "Periodo";
    default:
      return "Concepto";
  }
}

/**
 * Excel rechaza un libro con dos hojas del mismo nombre, y dos widgets pueden
 * llamarse igual sin que eso sea un error del usuario.
 */
function uniqueSheetName(title: string, used: Set<string>) {
  const base =
    title
      .replace(FORBIDDEN_IN_SHEET_NAME, " ")
      .trim()
      .slice(0, MAX_SHEET_NAME) || "Widget";

  let candidate = base;
  let suffix = 2;

  while (used.has(candidate)) {
    const tail = ` (${suffix})`;
    candidate = `${base.slice(0, MAX_SHEET_NAME - tail.length)}${tail}`;
    suffix += 1;
  }

  used.add(candidate);
  return candidate;
}

function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "panel"
  );
}

import type { WidgetConfig, WidgetType } from "./widget-config";

export type DefaultWidget = {
  type: WidgetType;
  /**
   * Titulo literal, no clave de i18n: es texto **editable** desde el momento en
   * que se siembra, asi que una clave dejaria de tener sentido en cuanto
   * alguien lo renombrase, y la API no tiene —ni necesita para esto—
   * infraestructura de traduccion.
   *
   * En espanol porque es el idioma por defecto del producto (ADR 003) y esto es
   * lo primero que se ve al entrar. Los `DEFAULT_PROJECT_COLUMNS` estan en
   * ingles, pero eso es deuda heredada de Kaneo, no un criterio que extender a
   * la pantalla principal.
   */
  title: string;
  config: WidgetConfig;
  span: number;
  rowSpan: number;
};

/** `done eq false`: el filtro que convierte un recuento en "lo que queda". */
const OPEN_ONLY = [
  { id: "open", field: "done", operator: "eq" as const, value: false },
];

/**
 * La distribucion de partida de un panel personal.
 *
 * Existe porque un panel vacio no responde ninguna pregunta: quien entra por
 * primera vez tiene que ver su trabajo, no un boton de "anadir widget". Se
 * materializa como filas de verdad la primera vez que alguien abre la pantalla,
 * asi que a partir de ahi es **suya**: mover, editar o borrar cualquiera de
 * estos widgets es una edicion normal y no vuelve a aparecer.
 *
 * Solo contiene widgets con datos detras hoy. La referencia de la que sale esta
 * pantalla incluia tarjetas de objetivos, notas y finanzas: los objetivos son la
 * rebanada 3 de esta misma fase, y notas y finanzas no existen en Riuna.
 *
 * Desde la ADR 043 se lee en tres alturas sobre la rejilla de doce columnas:
 * ocho cifras que caben en dos filas exactas (8 x 3 = 24), la semana en curso a
 * ancho completo, y abajo lo que queda por hacer con las notificaciones al
 * lado. El orden importa: es el `position` con el que nacen y el que ordena la
 * exportacion.
 */
export const DEFAULT_LAYOUT: DefaultWidget[] = [
  // Fila 1 y 2: las cifras. Todas sobre lo asignado a quien mira, porque la
  // pregunta que abre la pantalla es "que me toca", no "como va el espacio".
  {
    type: "count",
    title: "Vencidas",
    config: { scope: "assigned", dueWindow: "overdue", filter: OPEN_ONLY },
    span: 3,
    rowSpan: 1,
  },
  {
    type: "count",
    title: "Vencen hoy",
    config: { scope: "assigned", dueWindow: "today", filter: OPEN_ONLY },
    span: 3,
    rowSpan: 1,
  },
  {
    type: "count",
    title: "Vencen esta semana",
    config: { scope: "assigned", dueWindow: "week", filter: OPEN_ONLY },
    span: 3,
    rowSpan: 1,
  },
  {
    type: "count",
    title: "Pendientes",
    config: { scope: "assigned", filter: OPEN_ONLY },
    span: 3,
    rowSpan: 1,
  },
  {
    type: "count",
    title: "Cerradas · 7 días",
    // `rangeDays` es una ventana de **cierre**: la misma que dibuja una
    // tendencia, aqui reducida a una cifra.
    config: { scope: "assigned", metric: "doneCount", rangeDays: 7 },
    span: 3,
    rowSpan: 1,
  },
  {
    type: "count",
    title: "Alta prioridad",
    config: {
      scope: "assigned",
      filter: [
        ...OPEN_ONLY,
        {
          id: "urgent",
          field: "priority",
          operator: "in",
          value: ["high", "urgent"],
        },
      ],
    },
    span: 3,
    rowSpan: 1,
  },
  {
    type: "count",
    title: "Sin fecha",
    config: { scope: "assigned", dueWindow: "none", filter: OPEN_ONLY },
    span: 3,
    rowSpan: 1,
  },
  {
    type: "time",
    title: "Horas · 7 días",
    // `none` es el total sin repartir: una cifra de horas, no un reparto por
    // persona.
    config: { scope: "assigned", groupBy: "none", rangeDays: 7 },
    span: 3,
    rowSpan: 1,
  },
  // Fila 3: la semana en curso, que es lo que las cifras no pueden decir.
  {
    type: "week",
    title: "Mi semana",
    config: { scope: "assigned" },
    span: 12,
    // Dos filas y no tres: la tira son siete columnas de cuatro tareas como
    // mucho, y con tres sobraban cien pixeles de vacio bajo el contenido.
    rowSpan: 2,
  },
  // Fila 4: lo que queda por hacer, y al lado lo que ha pasado.
  {
    type: "table",
    title: "Tareas pendientes",
    config: { scope: "assigned", filter: OPEN_ONLY },
    span: 8,
    rowSpan: 4,
  },
  {
    type: "inbox",
    // Sus notificaciones. Se llamaba "Bandeja" hasta que ese nombre paso a ser
    // el proyecto de captura de cada persona (ADR 051).
    title: "Notificaciones",
    config: {},
    span: 4,
    rowSpan: 4,
  },
];

/**
 * Las filas de `dashboard_widget` que materializan la distribucion de partida
 * en un panel. La comparten la siembra y el "restaurar distribucion", que tienen
 * que dejar exactamente lo mismo.
 */
export function defaultWidgetRows(dashboardId: string) {
  return DEFAULT_LAYOUT.map((widget, position) => ({
    dashboardId,
    type: widget.type,
    title: widget.title,
    config: widget.config,
    span: widget.span,
    rowSpan: widget.rowSpan,
    position,
  }));
}

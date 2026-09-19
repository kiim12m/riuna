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
};

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
 */
export const DEFAULT_LAYOUT: DefaultWidget[] = [
  {
    type: "count",
    title: "Mis tareas",
    // `doneRatio` es lo que da la barra de progreso: hechas sobre el total.
    config: { scope: "assigned", metric: "doneRatio" },
    span: 1,
  },
  {
    type: "count",
    title: "De mis equipos",
    config: { scope: "team", metric: "doneRatio" },
    span: 1,
  },
  {
    type: "breakdown",
    title: "Vencimientos",
    config: { scope: "assigned", groupBy: "dueWindow" },
    span: 1,
  },
  {
    type: "table",
    title: "Asignadas a mí",
    config: { scope: "assigned" },
    span: 2,
  },
  {
    type: "inbox",
    title: "Bandeja",
    config: {},
    span: 1,
  },
  {
    type: "trend",
    title: "Cerradas por semana",
    config: { scope: "assigned", granularity: "week" },
    span: 3,
  },
];

/**
 * El tamaño con el que nace cada tipo de widget, en celdas de la rejilla de
 * doce columnas (ADR 043).
 *
 * **Espejo de `DEFAULT_WIDGET_SIZE`** en `apps/api/src/dashboard/widget-config.ts`,
 * igual que `GROUP_BY_BY_TYPE` lo es de `resolveWidget`. Existe una copia
 * porque el editor envia siempre ancho y alto —tiene que enseñarlos en sus
 * selectores—, asi que el defecto del servidor no llegaba a aplicarse nunca a
 * un widget creado desde la interfaz: una lista de tareas nacia de 4x2 y una
 * tira semanal de 4 columnas.
 *
 * Vive en su propio fichero y **sin un solo import** para que la prueba que
 * compara las dos tablas pueda leerlo desde la suite de la API sin arrastrar
 * React ni los alias del web. Mismo trato que las dos copias de `buildFilter`.
 */
export const SIZE_BY_TYPE = {
  count: { span: 3, rowSpan: 1 },
  breakdown: { span: 4, rowSpan: 2 },
  trend: { span: 6, rowSpan: 2 },
  time: { span: 4, rowSpan: 2 },
  epic_progress: { span: 4, rowSpan: 2 },
  table: { span: 8, rowSpan: 4 },
  inbox: { span: 4, rowSpan: 4 },
  goal: { span: 4, rowSpan: 2 },
  week: { span: 12, rowSpan: 2 },
} satisfies Record<string, { span: number; rowSpan: number }>;

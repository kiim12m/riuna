/**
 * La forma de pagina que comparten las dos lecturas que cruzan proyectos:
 * `GET /my-work/tasks` y `GET /my-work/tasks/search`.
 *
 * Son constantes de contrato, no de implementacion: la web escribe "500+"
 * cuando `totalIsCapped`, asi que el tope tiene que ser el mismo numero en las
 * dos o la misma etiqueta mentiria en una de ellas.
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/**
 * Tope del recuento. Por encima se devuelve el tope con `totalIsCapped`.
 *
 * El tope es lo que hace asumible la cuenta: el `LIMIT` va **dentro** de la
 * subconsulta, asi que Postgres para en cuanto junta 501 filas en vez de barrer
 * el espacio entero. Sin el, esto seria la cuenta siempre encendida que
 * `get-tasks.ts` documenta como error —evaluar dos veces la misma clausula
 * WHERE completa—.
 */
export const TOTAL_CAP = 500;

export function resolvePaging(page?: number, limit?: number) {
  const resolvedPage = page && page > 0 ? page : 1;
  const pageSize =
    limit && limit > 0 ? Math.min(limit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  return {
    page: resolvedPage,
    pageSize,
    offset: (resolvedPage - 1) * pageSize,
  };
}

/** La salida de "no hay nada que contar", distinta de una pagina vacia al final. */
export function emptyPage(page: number, pageSize: number) {
  return {
    tasks: [],
    pagination: {
      page,
      pageSize,
      hasMore: false,
      total: 0,
      totalIsCapped: false,
    },
  };
}

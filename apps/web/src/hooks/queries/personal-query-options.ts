/**
 * Frescura de las pantallas personales -Hoy, Planificador, Cronograma, Parte
 * de horas, Mis tareas, el cronometro y los contadores de la barra- (ADR 048).
 *
 * El cliente global apaga `refetchOnMount` y `refetchOnWindowFocus` porque los
 * tableros de proyecto son caros de releer. Pero con eso, una consulta
 * invalidada mientras su pantalla no esta abierta -completar una tarea en Hoy
 * invalida el Planificador; un aviso del canal de usuario invalida las tres-
 * se queda marcada y **no se relee al volver**: la pantalla ensena el estado
 * de antes hasta recargar. Estas lecturas son pequenas y por persona, asi que
 * aqui si compensa releer al montar o al volver a la pestana, con quince
 * segundos de margen para no pedirlo dos veces seguidas al saltar entre ellas.
 */
export const personalQueryOptions = {
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  staleTime: 15_000,
} as const;

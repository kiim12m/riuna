# ADR 044 — Un cronómetro por persona, impuesto por la base de datos, en el pie de la barra

**Fecha:** 2026-09-29 · **Estado:** aceptada

**Contexto.** `time-entry/` y sus fetchers y hooks web vienen del fork de
Kaneo, pero ningún componente los usa —`funcionalidades.md` lo declaraba
pendiente—. Nada impedía tener dos entradas abiertas a la vez, parar no
publicaba ningún evento, no había forma de borrar una entrada, y
`PUT /time-entry/:id` bastaba con el permiso `task:update` del espacio para
editar el registro de otra persona. La maqueta (`barra-lateral.html`) pone el
indicador en el pie de la barra lateral, no en una cabecera —la ADR 022 ya
maquetó y descartó esa variante—.

**Decisión.**

- **Un cronómetro por persona, en todo el servidor y no por espacio**,
  vigilado por un índice parcial único
  `time_entry_one_running_per_user ON (user_id) WHERE end_time IS NULL`, igual
  patrón que `cycle_one_active_per_project`. `POST /time-entry/start` cierra
  lo que estuviera en marcha antes de abrir lo nuevo, en la misma transacción;
  `POST /time-entry/stop` no necesita `taskId`, cierra lo que haya. Migración
  aparte: cierra las entradas abiertas duplicadas que ya existieran, cada una
  en el `start_time` de la siguiente abierta del mismo usuario.
- **Se para sola al entrar la tarea en una columna final** —como el
  `autoSetNextTask$` de super-productivity con su `currentTaskId`—: un
  suscriptor a `task.status_changed` relee `completed_at` (lo mantiene el
  disparador `task_set_completed_at`, ADR 025, que ya cubre los nueve
  escritores de `status`) en vez de reimplementar qué columna es final.
- **Solo el dueño edita o borra su entrada.** `PUT`/`DELETE /time-entry/:id`
  llevan la condición de dueño en el propio `WHERE`, mismo patrón que
  `updateComment`/`deleteComment`: un 404 y no un 403, para no confirmar que
  la entrada existe. Antes bastaba con el permiso de espacio.
- **Eventos `time-entry.stopped`/`.updated`/`.deleted` nuevos** (más el
  `.created` que ya existía) reenviados como `TIMER_CHANGED` por el canal de
  usuario —mismo patrón que `PLAN_INVALIDATED`—, para el pie de la barra, el
  Cronograma y el parte de horas.
- **El pie de la barra, no una cabecera.** Pulso, título y `HH:MM:SS`; en
  raíl solo el punto, con el título en el `title` del contenedor. Sin nada en
  marcha ofrece «▶ Reanudar» sobre la última tarea sin terminar —el play de
  la cabecera de super-productivity hace lo mismo con `lastCurrentTaskId`—.
  En móvil la barra es un `Sheet` que se abre aparte, así que una pastilla
  flotante aparte cubre ese hueco. Un aviso —una vez por entrada— cuando lo
  registrado supera la estimación, y al pararla una entrada de más de diez
  horas pregunta la hora real de fin en vez de estampar «ahora».
- **El parte de horas lleva las entradas de cada grupo, no solo el
  agregado**: siempre son propias —no lee tiempo de nadie más (ADR 042)—, así
  que se editan y se borran ahí mismo sin ninguna bandera de propiedad.

**Consecuencias.**

- Las instalaciones existentes con más de una entrada abierta por persona
  —un fallo que ya podían tener— las cierra la migración, no la aplicación en
  marcha.
- `schedule/controllers/get-schedule.ts` deja de mantener su propia consulta
  de la entrada en marcha: usa `time-entry/running.ts`, que ahora es la única.
- Parar sola una entrada al terminar la tarea es responsabilidad del
  suscriptor, no de cada uno de los escritores de `status`: si aparece un
  décimo camino que cambie el estado, hereda el comportamiento sin tocarlo.

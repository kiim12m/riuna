# ADR 077 — Recordatorio en la tarea

**Fecha:** 2026-10-12 · **Estado:** aceptada

**Contexto.** Punto 1.2 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado):
«recuérdamelo» en una tarea, sin planificarla. Hasta ahora lo único parecido era el aviso del
navegador a la hora anclada del plan del día (ADR 055), que solo suena con la pestaña abierta y
obliga a meter la tarea en el día.

**Decisión.**

- **Una tabla `task_reminder`**: tarea, persona, `remind_at` y una nota opcional de hasta 280
  caracteres. Hay **uno por persona y tarea**: poner otro lo sustituye. Es privado: la API solo
  devuelve el de quien pregunta. Basta con poder ver la tarea (`task:read`).
- **La hora es un instante.** Los atajos —mañana a las 9:00, el próximo lunes, en una semana— se
  calculan en el navegador, en la hora local de quien los pulsa. El servidor solo exige que
  esté en el futuro (con un minuto de margen) y a menos de un año.
- **Lo manda el planificador cada minuto** (`task-reminders`), no cada cinco: quien pide «a las
  9:00» no espera el aviso a las 9:04.
  - Cada fila se **reclama borrándola** con `FOR UPDATE SKIP LOCKED`. Dos instancias se reparten
    las filas sin arrendamiento, y la tabla solo guarda lo pendiente.
  - Lo que tocaba con la API parada sale en la primera vuelta.
  - Si la persona ya no es del espacio, el recordatorio se pierde sin avisar.
- **Llega como notificación `task_reminder`**, por la campana y por los canales de cada uno, con
  el proyecto y el espacio para que pinchar abra la tarea. No obedece a ninguna preferencia:
  lo ha pedido la propia persona.
- **Dónde se pone**:
  - el botón «Recuérdamelo» del detalle, con los tres atajos, día y hora, y la nota;
  - un submenú del menú contextual de filas y tarjetas, con los atajos. Cambia la hora y
    conserva la nota.
- **MCP**: `set_task_reminder` y `clear_task_reminder`.

**Consecuencias.**

- No queda rastro de los recordatorios enviados: la notificación es el rastro.
- Si el envío falla después de reclamar la fila, el recordatorio se pierde. Queda en el log y el
  trabajo sale degradado en el estado de la instancia (ADR 075).
- No hay una lista de «mis recordatorios». Se ven en el botón de cada tarea.

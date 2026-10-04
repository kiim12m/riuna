# ADR 026 — Tareas recurrentes

**Fecha:** 2026-09-04 · **Estado:** aceptada

**Contexto.** El parte semanal, la revisión mensual y el backup del viernes se
crean a mano una y otra vez. Riuna tenía ya un planificador (`croner`) y un
arrendamiento entre instancias (`job_lease`), pero solo servían a recordatorios,
facturación y reconciliación de asientos: **ningún trabajo programado creaba
datos de producto**.

**Decisión.** Una tabla `task_recurrence` con la plantilla y la cadencia en
`jsonb`, un trabajo cada cinco minutos que materializa lo que toca, y una
cadencia expresada como **modelo explícito** —frecuencia, intervalo, días— en vez
de una cadena RRULE.

**Consecuencias.**

- **Modelo explícito y no RRULE.** RRULE es el estándar y lo cubre todo, pero
  exige una dependencia nueva para interpretar casos que aquí no pide nadie («el
  último jueves laborable de cada trimestre»). Diario / semanal por días / mensual
  por día del mes cubre lo que la gente configura de verdad, se lee sin librería y
  se valida con una función pura. Si algún día hace falta RRULE, esta tabla se
  puede migrar; al revés no.
- **`date-fns` entra en la API.** Ya estaba en el monorepo para el web, así que
  es reutilizar y no una dependencia nueva del repositorio. El motivo concreto es
  el recorte de fin de mes: `setDate(31)` sobre febrero **no falla, se desborda a
  marzo**, y una tarea del día 31 acabaría apareciendo el 3. Es exactamente donde
  la aritmética de fechas hecha a mano se rompe.
- **Primero se reclama la fecha, después se crea la tarea.** La reclamación es
  condicional (`WHERE next_run_at = <la que se leyó>`), así que dos procesos no
  pueden generar la misma ocurrencia. El orden es deliberado: si la creación
  falla después de reclamar se pierde **una** ocurrencia; al revés, un fallo al
  avanzar la fecha dejaría la recurrencia disparando la misma tarea cada cinco
  minutos. Perder una es un inconveniente, duplicar sin freno es un destrozo.
- **Ponerse al día genera una sola tarea.** Si la instancia estuvo parada una
  semana, lo que se espera es una tarea y la próxima fecha al día, no siete de
  golpe ni una fecha en el pasado que vuelva a disparar en la siguiente vuelta.
- **El trabajo lleva arrendamiento y los recordatorios no.** Los recordatorios
  son idempotentes gracias a su tabla de «ya enviado»; generar una tarea no lo
  es, así que con varias instancias dos vueltas simultáneas crearían dos tareas.
- **Una fila que no se puede interpretar se apaga.** Reintentar cada cinco
  minutos para siempre una plantilla sin título llenaría el registro sin arreglar
  nada. Se marca `active = false` y el trabajo se reporta como degradado.
- **También se apaga la plantilla que el proyecto ya no admite**, y antes de
  reclamar la fecha. Entre una ocurrencia y la siguiente alguien puede borrar la
  columna o sacar del espacio a la persona asignada; sin comprobarlo, cada
  ocurrencia fallaba después de reclamar y se perdían todas en silencio.
- **Un fallo de infraestructura no apaga nada.** Esa comprobación consulta la
  base, así que distingue el rechazo de la validación (4xx) de una conexión caída
  o un pool agotado. Apagar por lo segundo dejaría apagadas **para siempre**
  todas las recurrencias de esa vuelta: se reporta degradado y se reintenta.
- **`template` y `cadence` van sin valor por defecto.** Con `DEFAULT '{}'` la
  `CHECK` de la frecuencia **no comprobaría nada**: `'{}'::jsonb->>'frequency'` es
  NULL y una `CHECK` pasa con NULL. De ahí el `IS NOT NULL` explícito y la
  ausencia de defecto.
- **La hora del día no se guarda.** Una tarea recurrente es «toca hoy», no «toca
  a las 9:03»; arrastrar la hora original haría que el resultado dependiera de a
  qué hora se creó la recurrencia.
- **Deuda declarada:** la plantilla no lleva etiquetas, épicas, campos
  personalizados ni subtareas —solo título, descripción, prioridad, estimación,
  responsable y equipo—. Las plantillas de árbol son la rebanada 4 de esta fase,
  y ahí es donde ese modelo se generaliza; duplicarlo aquí antes sería construir
  dos veces lo mismo.
- **Actualización (2026-10-04): lleva etiquetas, épicas y campos personalizados**
  (las subtareas siguen fuera). Se leen con el mismo código que una plantilla de
  tarea (`template/content.ts`, `parseTaskExtras`), se validan con
  `checkTemplateFits` al guardar y antes de cada ocurrencia, y se ponen con
  `decorateTask` —el mismo que usa el desplegador—. Una clave de campo que el
  proyecto ya no define se descarta; un valor que no casa con su tipo es un 400
  y apaga la recurrencia antes de reclamar la fecha. Las épicas se crean por
  nombre si faltan. El editor web solo escribe título y prioridad: esto es del
  modelo y de la API.

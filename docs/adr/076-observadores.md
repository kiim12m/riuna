# ADR 076 — Observadores de tarea

**Fecha:** 2026-10-12 · **Estado:** aceptada

**Contexto.** Punto 1.1 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado):
seguir una tarea sin estar asignado. Al empezar, un comentario y un cambio de estado solo
avisaban al **responsable principal**: el resto de asignados no se enteraba, aunque los
recordatorios de vencimiento ya les llegaban a todos (ADR 050). Cambiar el vencimiento no
avisaba a nadie, y la edición completa de la tarea (`update-task.ts`) ni siquiera publicaba
`task.due_date_changed`. Las decisiones de producto se tomaron preguntando (2026-10-12).

**Decisión.**

- **Una tabla `task_watcher`** (`task_id`, `user_id`, única por par), con borrado en cascada
  desde la tarea y desde la persona. Guarda solo a quien observa **a propósito**; los
  asignados no se copian en ella.
- **Quién recibe los avisos de una tarea**: sus asignados más sus observadores, menos quien
  hizo el cambio y menos quien ya no es del espacio. Los asignados son **observadores
  implícitos**: no pueden dejar de observar mientras lo sean.
- **Qué avisa**:
  - un comentario (`task_comment`);
  - un cambio de estado (`task_status_changed`);
  - un cambio de vencimiento, con un tipo nuevo, `task_due_date_changed`, que obedece a la
    misma preferencia que los recordatorios de vencimiento.

  Quien recibe una mención no recibe además el aviso de comentario. Lo que arrastra una
  cascada (`cascadedFrom`) y lo importado no avisan, igual que no disparan automatizaciones
  (ADR 067).
- **Se observa solo**:
  - al crear la tarea desde la interfaz, la captura rápida o la API;
  - al comentarla;
  - al ser mencionado en un comentario o en la descripción.

  No observa quien aplica una plantilla, quien importa, una recurrencia ni una
  automatización: crearían decenas de tareas de golpe. **Las tareas que ya existían no se
  rellenan**: empezar a recibir avisos de todo lo creado antes sería ruido.
- **Permisos**: observarse o dejar de observar a uno mismo pide `task:read`. Añadir o quitar
  a otra persona pide `task:assign` (los miembros lo tienen, ADR 062), y esa persona tiene que
  ser del espacio.
- **Dónde se ven**:
  - el filtro `watchers`, una pertenencia más del motor (ADR 014);
  - la pestaña «Observando» de Mis tareas: lo que observo, sigue abierto y no tengo asignado;
  - el destinatario «observadores» en la acción de avisar de las automatizaciones;
  - tres herramientas MCP: `get_task_watchers`, `watch_task` y `unwatch_task`.
- **Tiempo real**: `task.watchers_changed` refresca el detalle (canal del proyecto) y «Mis
  tareas» de quien entra o sale (canal de usuario). Lo que cambia dentro de una tarea
  observada llega en el siguiente sondeo: la membresía se empuja, el contenido se estira.

**Consecuencias.**

- **Los coasignados empiezan a recibir comentarios y cambios de estado**, y todos los
  asignados los cambios de vencimiento. Es lo esperado, pero es más correo y más ntfy.
- **Observar no deja rastro en la actividad**: es una preferencia de cada uno, no un cambio
  de la tarea.
- **Añadir a alguien no le avisa.** Se entera por el primer aviso que le llegue.
- **El filtro no sabe decir «yo»**: guarda el id de la persona, igual que el filtro de
  asignado. Una vista compartida «Lo que observo» enseña lo que observa quien la guardó. Un
  comodín «yo» en el motor sería un cambio para todos los campos de persona; queda como deuda.

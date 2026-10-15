# ADR 087 — Estado del proyecto

**Fecha:** 2026-10-13 · **Estado:** aceptada

**Contexto.** Punto 3.1 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado):
saber de un vistazo cómo va cada proyecto. Un proyecto de Riuna no tenía estado, fechas ni
responsable. La lista de proyectos enseñaba un «estado» calculado a partir del progreso (sin
empezar, en progreso, completado) que no decía si un proyecto iba bien. Las decisiones se tomaron
preguntando (2026-10-13). La referencia visual es la pestaña «Proyectos» de
[la maqueta](../design-previews/ideas-openproject.html).

**Decisión.**

- **Salud, con una nota**: sin empezar, en plazo, en riesgo, desviado, terminado o cancelado. La
  pone a mano quien gestiona el proyecto; no se deduce de nada. La nota, de 500 caracteres como
  mucho, va siempre con la salud.
- **Fechas propias** de inicio y fin. Si las tareas sin archivar acaban después del fin, la lista y
  la cabecera lo avisan con los días laborables de más. Es el aviso del padre desbordado de la
  ADR 083, con el mismo calendario.
- **Un responsable**, una persona del espacio, en una columna propia (`lead_user_id`): la lista lo
  filtra («Los míos») y lo ordena. Al borrar a la persona se queda vacío.
- **Columnas en `project`** (migración 0090): `health`, `health_note`, `start_date`, `end_date` y
  `lead_user_id`. La base vigila los valores de la salud y que el fin no sea anterior al inicio. Los
  proyectos que ya existían empiezan sin empezar, sin fechas y sin responsable.
- **`PATCH /project/:id/status`** cambia solo lo que llega. Pide `project:update`, el permiso que
  ya configura un proyecto. La Bandeja de una persona (ADR 051) no tiene estado.
- **Una actividad de proyecto** nueva, `project_activity`: la de siempre es de tareas y su
  `task_id` es obligatorio. Guarda una fila por cambio (salud, fechas, responsable) con quién lo
  hizo, y la lee `GET /project/:id/activity`.
- **«Avisar al espacio»** al cambiar la salud: llega a todo el espacio menos a quien la cambia, por
  la campana y los canales de cada uno, como un aviso de la ADR 081. Retocar la nota o una fecha no
  avisa.
- **Tiempo real**: el cambio llega a la lista y a la cabecera de todo el espacio por el canal de
  usuario (`PROJECTS_INVALIDATED`).
- **En pantalla**:
  - en la lista de proyectos, la salud sustituye al estado calculado, con el responsable, el inicio
    y el fin con su aviso, un resumen por estados y los filtros rápidos «Todos», «En riesgo o
    desviados» y «Los míos»;
  - en la cabecera del proyecto, un chip con la salud;
  - en los ajustes del proyecto, la sección «Estado y fechas», con el historial.
- **MCP**: `set_project_status`.

**Consecuencias.**

- Los filtros rápidos son de la 3.1. El motor de filtros, las columnas y las vistas guardadas de la
  lista llegan con la 3.2.
- Los webhooks y las integraciones de chat no reciben todavía el cambio de salud. Se añadirá cuando
  alguien lo pida.

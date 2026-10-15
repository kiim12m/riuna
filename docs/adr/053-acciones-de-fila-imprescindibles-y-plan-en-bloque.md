# ADR 053 — Acciones de fila, imprescindibles y plan en bloque

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** Cada pantalla personal ofrecía un trozo distinto de lo que se
puede hacer con una tarea:
- **Hoy:** cronómetro, casilla y «Añadir a hoy».
- **El Planificador:** arrastrar.
- **El Cronograma:** anclar.
- **Mis tareas:** nada más que abrirla.

Planificar para mañana obligaba a ir al Planificador. Tampoco había forma de
decir qué es lo importante del día, ni de traer de golpe lo atrasado. La
ADR 047 dejó declarados como deuda el plan en bloque y el menú contextual.

**Decisión.**

- **Un menú de acciones compartido**,
  `components/task-actions/task-row-actions.tsx`, en Hoy, el Planificador, el
  Cronograma y Mis tareas. Tiene:
  - hecha;
  - cronómetro;
  - planificar hoy y mañana;
  - elegir día, en un calendario;
  - fijar hora y estimar, cada uno en su diálogo;
  - quitar del plan;
  - imprescindible.

  Sale con el botón «⋯» y con el clic derecho o una pulsación larga. En
  base-ui el contextual es un menú con otro disparador, así que los dos pintan
  las mismas piezas. Cada uno tiene su propio estado de apertura.
- **Si la fila no sabe dónde está la tarea en el plan** (Mis tareas, el
  Cronograma), el menú lo pregunta al abrirse con
  `GET /planner/entry/:taskId`, que ahora devuelve también `keyRank`.
- **`personal_plan_entry.key_rank`** (1-3) marca las imprescindibles. Un índice
  único parcial `(user_id, workspace_id, planned_date, key_rank)` y un CHECK
  1-3 hacen que **la base** impida una cuarta.
- **`PUT /planner/:taskId/key`** toma el primer puesto libre, con 409 si no
  queda ninguno. Lleva un candado por persona para que dos marcas simultáneas
  no acaben en un 500.
- **El disparador `personal_plan_entry_clear_key_rank`**, `BEFORE UPDATE OF
  planned_date`, la desmarca al cambiar de día. Hay muchos escritores, la
  misma razón que la ADR 025.
- **`GET /today` pone las imprescindibles primero**, por su puesto. Hoy las
  enseña en un grupo propio, sin arrastre, y el resto se sigue reordenando.
- **`POST /planner/bulk`** planifica varias tareas al final de un día, o las
  saca del plan con `plannedDate: null`. Conserva la hora anclada y nunca toca
  `due_date`. Hoy lo usa en «Añadir todo a hoy».
- **`GET /planner?from=`** mueve la ventana más allá de quince días. «De días
  anteriores» se sigue contando desde hoy. La clave de caché lleva `from`, y
  el Planificador gana flechas de semana en semana y un «Hoy».

**Consecuencias.**

- **El orden entre imprescindibles es el del puesto**, no se arrastra.
  Cambiarlo es desmarcar y volver a marcar.
- **El Cronograma no pinta la estrella**: su lectura no trae el puesto, y el
  menú lo pregunta al abrirse.
- **En táctil**, la pulsación larga puede empezar un arrastre antes de abrir el
  contextual. El botón «⋯» se ve siempre en pantallas táctiles.
- **Verificado:**
  - 11 pruebas de integración: puestos, límite, carrera, límite en la base,
    desmarcar al mover por cualquier camino, espacio ajeno, orden de Hoy, plan
    en bloque y ventana desplazada. La de la carrera falla sin el candado;
  - 6 de extremo a extremo.

**Actualización (2026-10-15): las flechas van de día en día.** De semana en
semana, el usuario no conseguía ver los últimos días de la semana sin pasarse.
Ahora cada flecha mueve la ventana un día; `?from=` y «Hoy» no cambian.

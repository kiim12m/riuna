# ADR 088 — Campos de proyecto y cartera

**Fecha:** 2026-10-13 · **Estado:** aceptada

**Contexto.** Punto 3.2 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado):
mirar todos los proyectos como una cartera, con los atributos que cada espacio necesite (cliente,
tipo de obra, presupuesto…), filtrarla, guardar esas miradas y sacarla a Excel. Los campos
personalizados eran solo de tareas, y la lista de proyectos no filtraba ni elegía columnas. La
referencia visual es la pestaña «Proyectos» de [la maqueta](../design-previews/ideas-openproject.html).

**Decisión.**

- **Los campos de proyecto son campos personalizados de siempre** con una marca nueva:
  `field_definition.entity`, que vale `task` o `project` (migración 0091). Así se reutilizan los
  diez tipos, la validación, el editor de campos y sus rutas.
  - Un campo de proyecto se define siempre en el espacio, nunca en un proyecto, y no puede ser una
    relación: la base lo vigila.
  - Su clave es única por espacio y por `entity`, así que un «presupuesto» de tarea y otro de
    proyecto conviven.
  - Las lecturas de campos de tarea filtran `entity = 'task'`: los campos de un proyecto, los del
    espacio, el registro de «Mis tareas» y las automatizaciones nunca ven uno de proyecto.
- **Sus valores** van en `project.custom_fields`, como los de una tarea. Los escribe
  `PUT /project/:id/custom-fields`: es parcial, un valor vacío borra la clave, la fusión va en SQL
  sobre la fila bloqueada, pide `project:update` y deja rastro en la actividad del proyecto
  (ADR 087).
- **La lista de proyectos pasa por el motor de filtros** ([ADR 014](014-motor-de-filtros.md)). El
  compilador ya era agnóstico del ámbito: el registro nuevo (`portfolio-registry.ts`) apunta a las
  columnas de `project`. Los campos de proyecto van como `custom.<key>`, sobre la columna JSONB que
  diga el descriptor. Se puede filtrar por nombre, clave, salud, responsable, fechas, creación,
  **progreso** (un cálculo correlacionado: una cartera son decenas de proyectos) y cada campo de
  proyecto.
- **La lista como cartera**:
  - columnas elegibles, con la de nombre fija;
  - orden por cabecera, en el navegador, con lo vacío siempre al final;
  - edición de los campos en la propia celda;
  - los filtros rápidos de la 3.1;
  - reordenar arrastrando, solo sin filtro ni orden.

  Todo vive en la URL, así que se comparte pegando el enlace.
- **Vistas guardadas** de tipo `portfolio`, siempre de espacio. Guardan el filtro, las columnas y el
  filtro rápido.
- **Exportación a Excel** (`GET /project/export`) con el filtro que se ve. Lleva las columnas fijas
  y una por campo, con los valores como se leen: la etiqueta de la opción, el nombre de la persona.
  Las cabeceras van en castellano, como las de la exportación de tareas. El PDF llegará con la 4.2.
- **En pantalla**:
  - los campos de proyecto se definen en Ajustes del espacio › Campos personalizados, en su propia
    sección;
  - cada proyecto los rellena en «Estado y fechas» o en la celda de la lista.
- **MCP**: `list_projects` acepta `filter`, y `set_project_fields` escribe los valores.

**Consecuencias.**

- Un campo de proyecto no se ve en las tareas, ni al revés. Heredar un valor del proyecto a sus
  tareas sería otra decisión.
- La lista no pagina: un espacio tiene decenas de proyectos, no miles. El filtro corre en el
  servidor; el orden, en el navegador.

# ADR 089 — Subproyectos

**Fecha:** 2026-10-13 · **Estado:** aceptada

**Contexto.** Punto 3.3 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado):
agrupar proyectos bajo otro, como un cliente con varias obras, y ver el conjunto. Los proyectos de
Riuna eran una lista plana. Las decisiones se tomaron preguntando (2026-10-13). La referencia
visual es la pestaña «Proyectos» de [la maqueta](../design-previews/ideas-openproject.html).

**Decisión.**

- **Un solo nivel**: `project.parent_id` (migración 0092).
  - El padre no puede tener padre, y un proyecto con subproyectos no puede colgar de otro.
  - La Bandeja de una persona (ADR 051) no entra en el árbol.
  - Padre e hijo son del mismo espacio.
  - Al borrar el padre, sus hijos vuelven a ser proyectos sueltos.
- **`PATCH /project/:id/parent`** pide `project:update` y comprueba las reglas bajo un cerrojo del
  espacio: dos peticiones a la vez podrían dejar dos niveles. El cambio queda en la actividad del
  hijo (ADR 087).
- **Permisos**: no hay herencia que diseñar. Los proyectos de un espacio los ve todo el espacio y
  los permisos son del espacio, así que un subproyecto se gobierna igual que cualquier otro.
- **Agregados**: en la lista, un padre resume su rama, sus tareas y las de sus hijos sin archivar:
  progreso, número de tareas y aviso de desviación (ADR 087). El filtro por progreso de la
  cartera (ADR 088) cuenta lo mismo.
- **La lista de proyectos sale en árbol**, con cada hijo bajo su padre y plegable. Un hijo cuyo
  padre deja fuera el filtro sale como raíz. Con subproyectos no se reordena a mano.
- **Las vistas del padre pueden incluir las tareas de los hijos**: Lista, Tabla, Gantt y Calendario,
  con un interruptor que va en la URL y, en la Tabla, en la vista guardada. El tablero no, porque
  cada proyecto tiene sus columnas.
  - `GET /task/tasks/:projectId?includeSubprojects=true` devuelve aparte las tareas de cada hijo,
    con sus columnas; las del hijo no son las del padre. Siempre dice cuántos subproyectos hay,
    para ofrecer el interruptor.
  - Los totales y la línea base aceptan lo mismo y suman o juntan lo de cada uno.
  - El filtro del padre se aplica a cada hijo. Si nombra un campo que el hijo no tiene, ese hijo no
    aporta tareas, en vez de tumbar la vista.
  - Cada tarea de un hijo lleva su clave (`ALC-12`). La Lista las pinta en una sección por
    subproyecto, sin arrastre. El detalle se abre con el proyecto de la propia tarea, con sus
    estados y sus campos.
- **Tiempo real**: lo que se difunde a un subproyecto se reenvía al canal de su padre, sin excluir a
  quien lo hizo, para que su vista del padre también se ponga al día.
- **En pantalla**: «Subproyecto de» en los ajustes generales del proyecto.
- **MCP**: `set_project_parent`.

**Consecuencias.**

- La barra lateral sigue plana: los subproyectos salen como cualquier otro proyecto.
- Nada se une por prefijo de un camino. Un nivel se resuelve con `parent_id` y un índice, y cada
  hijo se lee con las mismas consultas que un proyecto suelto.
- Un subproyecto archivado no cuenta en su padre ni aparece en sus vistas.

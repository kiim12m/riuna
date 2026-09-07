# ADR 027 — Plantillas de proyecto y de árbol

**Fecha:** 2026-09-04 · **Estado:** aceptada

**Contexto.** Cada lanzamiento, cada alta de cliente y cada auditoría se
descomponen en el mismo árbol de tareas, y hoy se rehace a mano. La Fase 2 dio
el árbol; faltaba poder guardarlo y volver a desplegarlo. La rebanada 3 dejó
además un modelo de plantilla a medias —solo título, prioridad, estimación,
responsable y equipo— que había que generalizar en vez de duplicar.

**Decisión.** Una tabla `template` colgada del **espacio de trabajo**, con el
árbol entero en `content jsonb`, capturada desde un proyecto o desde un subárbol
existente, y desplegada llamando a `createTask` tarea por tarea.

**Consecuencias.**

- **Del espacio de trabajo, no del proyecto.** Una plantilla que solo sirviera
  donde se creó no sería una plantilla. Es la misma decisión que
  `field_definition` toma con su `project_id` nulo.
- **El árbol va en `jsonb`, no en tablas espejo.** Guardarlo como «tareas
  plantilla» duplicaría `task`, sus dos `CHECK` y su `path` para datos que no se
  consultan ni se filtran: se leen enteros al aplicar y nunca por partes.
- **Cada tarea se crea con `createTask`.** Es lo único que toma el cerrojo del
  proyecto, resuelve `path`/`depth`, reclama el número de tarea y sincroniza el
  responsable. Insertar a mano sería más rápido y dejaría el árbol incoherente,
  que es justo lo que las dos `CHECK` de la Fase 2 existen para impedir. El
  coste es una toma de cerrojo por tarea; con el tope de 500 es asumible.
- **La profundidad se comprueba antes de crear nada.** Sin esa guarda previa,
  una plantilla más honda que el `maxTaskDepth` del proyecto fallaría a mitad
  —`createTask` rechaza cada hija demasiado profunda— y dejaría medio desplegado
  algo que nadie pidió a medias.
- **Topes deliberados:** 500 tareas y 10 niveles. Una plantilla se lee entera en
  memoria y se despliega tarea a tarea; sin límites, una plantilla absurda sería
  un agotamiento de recursos contra la propia instancia.
- **Las épicas se resuelven por nombre y se crean si faltan.** Una plantilla
  aplicada a otro proyecto no puede referirse a ids que allí no existen. Las
  etiquetas viajan igual, por nombre y color.
- **Lo que NO viaja: responsables, equipos, fechas y tiempo registrado.** Una
  plantilla describe *qué* hay que hacer, no quién lo hizo ni cuándo; copiar el
  responsable de la última vez es como se acaba asignando trabajo a quien ya no
  está.
- **Deuda declarada:** una plantilla de proyecto guarda columnas y épicas, pero
  aplicarla solo despliega el árbol dentro de un proyecto **existente**. Crear
  un proyecto entero desde la plantilla —con sus columnas— es el paso que falta,
  y toca `create-project`, que hoy siembra siempre las cuatro columnas por
  defecto.

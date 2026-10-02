# ADR 048 — Pantallas personales frescas y un runtime de espacio

**Fecha:** 2026-10-01 · **Estado:** aceptada

**Contexto.** La revisión de lo que la productividad personal hace de verdad
(interludio de productividad personal y equipo, `plan.md`) encontró tres
defectos con la misma raíz: nada vivía más que la pantalla en la que se estaba.

- **Datos viejos al volver.** El cliente global apaga `refetchOnMount` y
  `refetchOnWindowFocus`, porque releer un tablero de proyecto es caro. El
  efecto es que una consulta invalidada mientras su pantalla no estaba abierta
  se queda marcada y no se relee al volver. Completar una tarea en Hoy
  invalida el Planificador, pero al ir al Planificador se veía el estado de
  antes hasta recargar.
- **Huecos en el canal de usuario.** `MY_WORK_INVALIDATED` solo invalidaba
  `my-work` y los paneles, así que una tarea recién asignada no llegaba a Hoy
  ni a «Sin planificar». `TIMER_CHANGED` no refrescaba lo registrado que
  enseña el Planificador.
- **Todo colgaba de la barra lateral.** La conexión del canal de usuario
  estaba en el selector de espacio, y el reloj de la pestaña, el aviso de
  estimación superada y Ctrl+E en el pie del cronómetro. Cada ruta monta su
  propio `<Layout>`, así que todo eso se desmontaba en cada cambio de
  pantalla: el socket se reconectaba y el aviso se repetía. En móvil, donde la
  barra es un panel que solo existe abierto, no había conexión, campana ni
  atajo casi nunca. Los ajustes de cuenta, que no tienen barra, tampoco los
  tenían.

**Decisión.**

- **Las lecturas personales releen al montar y al volver a la pestaña**, con
  15 s de frescura (`personalQueryOptions`). Son Hoy, Planificador,
  Cronograma, Parte de horas, Mis tareas, el cronómetro y los contadores de la
  barra. El valor global no cambia: los tableros siguen sin releer.
- **Un mapa puro mensaje → claves**, `user-ws-invalidations.ts`, con su
  prueba. `MY_WORK_INVALIDATED` añade `today`, `planner` y `schedule`;
  `TIMER_CHANGED` añade `planner`.
- **`WorkspaceRuntime`**, montado una vez en la ruta `dashboard`, que no se
  desmonta al navegar y cubre también los ajustes de cuenta. Se lleva la
  conexión del canal de usuario, el reloj de la pestaña, el aviso de
  estimación y Ctrl+E, con su diálogo de parada larga. `SidebarTimer` solo
  pinta.
- **El aviso de estimación** recuerda lo ya avisado en `sessionStorage`.
- **En móvil, una campana en la cabecera** (`MobileHeaderBell`). Se decide en
  JS y no con `md:hidden`, para que en escritorio no haya una segunda instancia
  montada. Esa campana no registra `n o`: el registro de atajos va por tecla,
  y desmontar una segunda instancia borraría el atajo de la primera.

**Consecuencias.**

- Volver a una pantalla personal cuesta una petición pequeña si sus datos
  tienen más de 15 s o están invalidados. Es el precio de no enseñar datos
  viejos, y se paga solo en lecturas por persona.
- El contenido que no cambia la pertenencia —prioridad, fecha, título— sigue
  sin empujarse por la razón de la ADR 024. Ahora lo recoge el releer al
  volver, que antes no ocurría.
- Tres pruebas de extremo a extremo (`today.spec.ts`) fallan con el código
  anterior y pasan con este:
  - una asignación hecha desde fuera aparece en Hoy sin recargar;
  - al volver de Planificador a Hoy se ve lo planificado mientras tanto;
  - en móvil, la campana de la cabecera cuenta en vivo con la barra cerrada.

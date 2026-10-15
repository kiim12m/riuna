# ADR 084 — Precedencias y planificación automática

**Fecha:** 2026-10-13 · **Estado:** aceptada

**Contexto.** Punto 2.3 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado):
«esta empieza cuando acabe aquella». `task_relation` solo sabía `blocks` y `related`, que se
dibujaban pero no movían nada. Las decisiones se tomaron preguntando (2026-10-13).

**Decisión.**

- **Una relación `precedes`** (`source` precede a `target`; «sigue a» es la misma vista desde la
  otra punta) con **un desfase en días laborables**, `lag`, negativo para solapar (migración
  0089).
- **La sucesora va atada**: con fechas automáticas, empieza el día laborable siguiente al fin de
  su última predecesora, más el desfase. Se mueve en los dos sentidos, y conserva sus días
  laborables de duración. Un hito atado es un solo día. Crear la relación pone a la sucesora en
  fechas automáticas; con fechas propias se dibuja, pero no se mueve.
- **Días laborables**: de lunes a viernes, sin los festivos del espacio. No mira las ausencias,
  así que la misma tarea se planifica siempre igual. Es el calendario de la ADR 083.
- **Lo que no se puede planificar se rechaza al crear**, bajo el cerrojo del proyecto:
  - entre proyectos (400);
  - con un resumen como sucesora (400): sus fechas salen de las subtareas, así que la relación
    va en ellas;
  - dentro de la propia rama (400);
  - si cerraría un ciclo (409). El ciclo se busca siguiendo lo que arrastra la planificación:
    de una predecesora a sus sucesoras y de una hija a su padre.

  El núcleo lleva además un tope de vueltas por si algún camino lo dejara pasar.
- **El mismo motor que la ADR 083.** `computeSchedule` atiende a las hijas y a las predecesoras,
  y cada cambio despierta a sus sucesoras y a sus ancestros. Una relación nueva, el cambio de su
  desfase o su borrado replanifican la sucesora. Mover una tarea de proyecto rompe las
  precedencias que quedarían cruzando.
- **El inicio de una sucesora atada no se edita a mano.** La edición completa lo ignora; el fin
  sí se mueve, porque es su duración. El Gantt no la deja arrastrar, pero sí estirar.
- **Actividad propia**: `precedence_changed` en la sucesora (añadida, desfase, quitada), y las
  fechas que mueve la planificación como efecto secundario: no avisan ni disparan
  automatizaciones.
- **Gantt**: flechas fin → inicio de `precedes` con su desfase («+2 d», «−1 d»), además de las de
  `blocks`.
- **MCP**: `precedes` y `lag` en `create_task_relation`, y `set_task_relation_lag`.

**Consecuencias.**

- **Medido con 50.000 tareas** (proyectos de 10.000):
  - mover la cabeza de una cadena de 200 precedencias, que arrastra unas 240 tareas entre
    sucesoras y resúmenes, tarda 72 ms de mediana y 167 ms en el p95, publicación de eventos
    incluida;
  - un cambio sin nada automático encima corta en la consulta previa: 1,4 ms.

  Con la batería de integración corriendo a la vez en el mismo Postgres, la cadena llegó a
  299 ms de p95.
- **`EXPLAIN`**:
  - la carga del proyecto va por `task_projectId_idx` (5 ms, 10.000 filas);
  - las precedencias, por las claves primarias de las dos puntas (4 ms);
  - la consulta previa, por clave primaria (0,2 ms).

  El cálculo en memoria cuesta unos 15 ms. Escribir va en una sola sentencia con `unnest`: una
  lista `VALUES` pedía cuatro parámetros por fila.
- Una dependencia entre proyectos no se puede expresar: haría falta coordinar dos cerrojos.

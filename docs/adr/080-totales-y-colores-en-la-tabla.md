# ADR 080 — Totales y colores en la Tabla

**Fecha:** 2026-10-12 · **Estado:** aceptada

**Contexto.** Punto 1.5 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado):
una fila de totales y colorear filas. La Tabla recibe todas las tareas del filtro, sin paginar,
pero no trae el tiempo registrado de cada tarea: solo el resumen de las ramas.

**Decisión.**

- **Los totales los calcula la API**, en `GET /task/tasks/:projectId/totals`, con el mismo
  `filter` y `treeScope` que la lista. Comparten la cláusula `taskListWhere`, que sale de
  `get-tasks.ts`, para que sumen exactamente lo que se pinta.
- **Cada tarea cuenta una vez**: su estimación, su tiempo registrado y sus valores. Sumar ramas
  contaría dos veces a las hijas que también casan.
- **Lo que suma**:
  - cuántas tareas hay;
  - la estimación;
  - el tiempo registrado;
  - cada campo de número o moneda.

  Un valor guardado que no es número no suma ni rompe la consulta.
- **Se pinta como una franja pegada abajo**, no alineada con las columnas: el registrado no tiene
  columna, y las columnas de rama no suman lo mismo.
- **La web la vuelve a pedir cada vez que la lista se refresca.** La clave lleva cuándo se
  refrescó la lista, y queda fuera de `["tasks"]`, donde hay quien escribe dando por hecho que
  hay un proyecto.
- **Colorear filas** por prioridad (urgente en rojo, alta en ámbar) o por vencimiento (vencida en
  rojo, vence en siete días en ámbar, lo hecho sin color). Va en la URL (`color`) y se guarda en
  la vista.
- **MCP**: `get_task_totals`.

**Consecuencias.**

- Medido sobre 50.000 tareas, con proyectos de 10.000 (p95 de 20 vueltas):
  - sin filtro, 21 ms;
  - por prioridad, 21 ms;
  - por un campo personalizado, 35 ms;
  - con la rama entera de lo que casa, 111 ms.
- Solo en la Tabla del proyecto. La de Mis tareas sigue sin totales.

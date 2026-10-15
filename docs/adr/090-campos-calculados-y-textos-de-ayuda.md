# ADR 090 — Campos calculados y textos de ayuda

**Fecha:** 2026-10-14 · **Estado:** aceptada

**Contexto.** Punto 4.1 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado):
un campo cuyo valor sale de otros, como «Coste por hora = Presupuesto ÷ Horas previstas», y una
ayuda que diga qué significa cada campo. El plan dejaba a esta ADR decidir si el valor se
materializa. El usuario decidió dos reglas al preguntarle (2026-10-14):
- si falta un dato, el resultado queda vacío;
- «Estimado» y «Registrado» son los de toda la rama.

El aspecto (el «?», la «ƒ» y la fórmula bajo el valor) es el de
[la maqueta](../design-previews/ideas-openproject.html).

**Decisión.**

- **Un tipo nuevo, `formula`** (migración 0093, que solo amplía el CHECK de tipos).
  - Su configuración lleva la fórmula, el formato (`number`, `currency` con su moneda, o
    `percent`) y nada más.
  - Solo para tareas: un campo de proyecto (ADR 088) no se calcula.
  - No puede ser obligatorio.
  - Nadie escribe su valor: ni la API, ni el MCP, ni una automatización, ni una plantilla, ni el
    importador, que ignora esa columna para que la ida y vuelta del Excel no falle.
- **El lenguaje** se escribe como una hoja de cálculo en castellano:
  - nombres de campo entre llaves (`{Horas previstas}`), o sin ellas si son una palabra;
  - `{Estimado}` y `{Registrado}`, en horas;
  - `+ − × ÷`, `min(…; …)`, `max(…; …)` y `si(condición; valor; si no)`;
  - `;` separa argumentos y la coma decimal vale entre cifras.

  Lo lee un analizador descendente propio, de unas decenas de líneas, sin `eval` ni dependencias.
  Una fórmula puede leer otra; un ciclo se rechaza al guardar.
- **Se guarda con claves** (`{presupuesto} / {:estimate}`), no con nombres: renombrar un campo no
  rompe las fórmulas que lo leen. La interfaz la vuelve a escribir con nombres para editarla y
  para enseñarla. No se puede archivar ni borrar un campo que lee una fórmula (409).
- **Vacíos**:
  - un dato que falta deja vacío el resultado, y dividir por cero también;
  - una condición que no se puede saber deja vacío el «si»;
  - `min` y `max` ignoran los vacíos, así que `max({Presupuesto}; 0)` es la forma de poner un 0
    por defecto;
  - lo registrado vale 0 si no hay horas.
- **Se materializa en `task.custom_fields`**, como cualquier número. Así el motor de filtros, el
  orden, las vistas, las exportaciones y el MCP lo leen sin saber que existe. La línea base (ADR
  085) lo da por igual que ahora: recalcular no deja actividad. Las alternativas eran peores:
  - calcularlo al leer obligaba a enseñarle la fórmula a cada lector;
  - evaluarlo en JavaScript dejaba una carrera entre leer y escribir.
- **Se evalúa en la base**. La fórmula se traduce a SQL, y la misma sentencia `UPDATE` que la guarda
  la calcula sobre la versión de la fila que está escribiendo: dos ediciones casi simultáneas no
  se pisan.
  - Una fórmula que lee otra la despliega, porque dentro de la sentencia el valor guardado sería
    el viejo.
  - Las ramas se suman con un `LIKE` de patrón constante por ancestro, o con los segmentos del
    `path` para el proyecto entero, nunca con un patrón que dependa de la fila (`AGENTS.md`).
  - Lo archivado no cuenta, como en `tree-aggregates`.
- **Se recalcula** (`refreshFormulasAfter`) después de cada cosa que una fórmula lee:
  - los campos de la tarea;
  - la estimación y el tiempo registrado, también el del cronómetro que se cierra al abrir otro;
  - el árbol: crear, mover, reparentar, borrar, archivar y la cascada de estados;
  - las plantillas;
  - la importación, el proyecto entero;
  - una fórmula nueva o cambiada, todo su alcance.

  Va fuera de la transacción de quien escribe y, con valores de rama, bajo el cerrojo del árbol del
  proyecto. Si falla, deja el valor anterior y una línea en el registro: nunca rechaza la escritura.
  Lo cambiado se difunde como `task.formulas_refreshed`, porque puede ser un ancestro que nadie
  tocó.
- **Texto de ayuda**: es la columna `field_definition.description`, que existía desde la Fase 2 y no
  enseñaba nadie, ahora con un máximo de 500 caracteres. Sale como un «?» junto al nombre en el
  detalle, en la cabecera de la Tabla, en el editor de campos y en el importador. En un calculado
  añade cómo se calcula.
- **En pantalla**: el tipo «Calculado» en el diálogo de campo, con botones para meter cada campo; el
  lápiz del editor abre ese diálogo para cambiar nombre, ayuda y fórmula. En la Tabla, la columna
  lleva «ƒ» y no suma en los totales: la suma de cocientes no significa nada. En el detalle, la
  fórmula sale bajo el valor.
- **MCP**: `list_project_fields`, con claves, ayuda y fórmula.

**Consecuencias.**

- Medido con 50.000 tareas:
  - recalcular tras una escritura cuesta un p95 de 6,5 ms, y 20 ms si hay valores de rama, que
    arrastran a los ancestros;
  - repasar un proyecto de 10.000 tareas sin cambios, 62 ms y 147 ms;
  - una fórmula nueva del espacio escribe 50.000 filas una vez, en unos 6 s. Cada una actualiza el
    índice GIN de `custom_fields` y los demás.
- Recalcular no deja actividad, no avisa y no dispara automatizaciones: es un dato derivado.
- Una fórmula del espacio no ve los campos de un proyecto. Si un proyecto redefine con otro tipo
  una clave que lee, en ese proyecto sale vacía.

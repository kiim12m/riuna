# ADR 091 — Exportar a PDF

**Fecha:** 2026-10-14 · **Estado:** aceptada

**Contexto.** Punto 4.2 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado):
sacar en papel una tarea, cualquier vista con sus filtros y el parte de horas con sus totales. La
3.2 dejó pendiente el PDF de la cartera hasta este punto. El aspecto de los tres documentos es el
de [la maqueta](../design-previews/ideas-openproject.html) aprobada, pestaña «PDF».

**Decisión.**

- **Se genera en la API**, como el Excel, con la misma búsqueda que ya exporta este. Así el PDF de
  una vista es el filtro de la URL, sin un segundo estado que sincronizar (ADR 015).
- **Dependencia nueva: `pdfmake` (MIT)**, porque maqueta tablas que saltan de página repitiendo la
  cabecera, que es lo que necesitan los documentos; con `pdfkit` a secas habría que escribir ese
  motor de tablas. Trae `pdfkit` y `fontkit` (MIT) y la fuente Roboto (Apache 2.0), que cubre el
  castellano, el catalán, el euro y los signos de las fórmulas. Nada GPL. Los tipos van en
  `@types/pdfmake`, de desarrollo.
- **Cerrado por defecto**: el documento no puede pedir nada a la red ni leer otro fichero que sus
  fuentes (`setUrlAccessPolicy`, `setLocalAccessPolicy`). Todo lo que lleva es texto de la base.
- **Un marco común**, en `apps/api/src/pdf/`:
  - arriba, la marca, de dónde sale («Espacio / Proyecto») y cuándo se generó;
  - abajo, quién lo generó y la página;
  - los valores como los escribiría una persona en castellano: «26 oct», «20 h 15 min»,
    «18.400,00 €», las opciones por su etiqueta y un campo calculado con su formato (ADR 090).
  - El constructor de cada documento devuelve su definición y la ruta la dibuja; así las pruebas
    leen el contenido, que en el PDF va comprimido.
- **Cuatro documentos**:
  - **Una tarea**, `GET /task/:id/pdf`: la ficha, con asignados, fechas, padre, épicas, cada campo,
    y lo estimado y registrado propio y de la rama. Después, la descripción en texto, las
    subtareas directas y los comentarios.
  - **Una vista**, `GET /task/export/:projectId?format=pdf`, con el filtro y el ámbito de árbol de
    la URL. Desde la Tabla lleva sus columnas visibles; desde el Gantt y el Calendario, unas fijas.
    - Va en el orden del esquema, como el Excel, y en apaisado si no cabe.
    - Al pie, los totales: cada tarea una vez, como la franja de la Tabla (ADR 080), y sin sumar
      los calculados.
    - El título y el filtro en palabras los manda la web, que es quien los sabe escribir.
    - Hasta 5.000 filas: más que eso no se imprime, y para eso sigue el Excel, con 20.000.
  - **El parte de horas**, `GET /time-sheet/export?format=pdf`: las entradas de quien lo pide, con
    el grupo en su primera fila y el total; un resumen de lo registrado frente a la jornada de cada
    día, con festivos y ausencias a cero (ADR 045, ADR 060); y dos firmas, la de la persona y el
    visto bueno del responsable.
  - **La cartera**, `GET /project/export?format=pdf`, con sus columnas visibles y cada subproyecto
    bajo su padre (ADR 088, ADR 089).
- **Los permisos son los de leer** lo que se exporta, los mismos que el Excel y la vista.
- **En pantalla**:
  - un menú «Exportar» (PDF, Excel y CSV) en la Tabla, el Gantt y el Calendario: la API ya
    exportaba la vista con su filtro, pero no había botón;
  - el botón del parte de horas y el de la cartera pasan a ser ese mismo menú, con Excel y PDF;
  - un botón de PDF en las acciones de la tarea.
- **El MCP no exporta PDF**: un agente no lee un PDF que él mismo pide. Ya tiene los mismos datos
  en sus herramientas.

**Consecuencias.**

- Medido con 50.000 tareas: una tarea, el parte de una semana o la cartera tardan menos de 110 ms.
  Una vista de 60 filas, 230 ms; la de 5.000, el máximo, unos 4 s y 1,3 MB.
- Las vistas de un padre con sus subproyectos (ADR 089) exportan solo las tareas del padre, como
  el Excel.
- El parte de horas de otra persona no se exporta: el parte solo es de quien lo mira (ADR 042).

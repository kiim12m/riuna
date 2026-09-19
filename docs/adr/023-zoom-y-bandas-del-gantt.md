# ADR 023 — Zoom y bandas de cabecera del Gantt

**Fecha:** 2026-09-03 · **Estado:** aceptada

**Contexto.** El Gantt heredado fijaba una columna = un día (`2.75rem`) y
colocaba las barras con `grid-column`. Sin zoom, un proyecto que abarca meses
solo se puede leer a base de scroll, y `grid-column` no permite que una barra
empiece a mitad de una unidad cuando se aleja la escala.

**Decisión.** Posicionar **todo por píxeles/día**. Un `GanttTimeline`
(`rangeStart`, `totalDays`, `pixelsPerDay`, `trackWidthPx`) es la única fuente
de verdad; el nivel de zoom (`day` / `week` / `month` / `quarter`, en la URL como
`?zoom=`) solo cambia `pixelsPerDay` y **qué** dibuja `buildHeaderBands`: dos
bandas cuya composición se adapta (mes/día, mes/semana, año/mes, año/trimestre)
y líneas verticales solo en el límite de la unidad mayor. La matemática de
barras, arrastre, redimensión y dependencias es idéntica en los cuatro niveles.
El arrastre siempre encaja a día. `‹ Hoy ›` recentra el scroll (patrón de
`calendar-toolbar.tsx`).

**Consecuencias.**
- `differenceInCalendarDays(fecha, rangeStart) * pixelsPerDay` da la posición en
  cualquier zoom; no hay ramas por nivel salvo la forma de la cabecera.
- Al alejar, `pixelsPerDay` baja a ~2 px: el arrastre se vuelve fino pero sigue
  siendo preciso al día. Encajar a semana/mes queda para más adelante.
- La capa de dependencias y `GanttTaskBar` comparten `barMetrics()` de
  `gantt-timeline.ts`, así que barra y conector nunca se desalinean.
- `barMetrics()` ancla en el **centro** del día de inicio y del de fin, no en los
  bordes de la columna: la barra apunta al día al que se refiere y una tarea de
  un solo día sale como un punto centrado sobre él, no como un bloque de 24 h.
- **HOY se sombrea, no se dibuja.** Se pinta la columna de la unidad actual
  —tomada del propio tramo de cabecera marcado `isCurrent`, para que cabecera y
  cuerpo no se puedan desalinear— en vez de una línea vertical con etiqueta: esa
  etiqueta se solapaba con el número del día. El tramo de cabecera lleva
  `aria-current="date"`, así que el dato no se pierde sin texto.
- El rango se calcula sobre todas las tareas con fecha (no las que filtra la
  búsqueda): la escala no salta al escribir.
- Referencia visual: [`design-previews/gantt.html`](../design-previews/gantt.html).

# Previews de diseño

Maquetas HTML autónomas sobre las que se decide **antes** de tocar `apps/web`.
Quedan aquí como referencia de qué se acordó y de cómo debe verse y comportarse.
Las tres primeras son del rediseño visual previo a la Fase 6; `barra-lateral.html`
es del interludio de espacio personal y administración.

| Fichero | Qué es | ADR que respalda |
|---|---|---|
| [`sistema-base.html`](sistema-base.html) | Specimen del lenguaje base: color, tipografía, densidad, elevación, radios, movimiento, estados y vocabulario. | [018](../adr/018-escala-tipografica.md), [019](../adr/019-densidad-configurable.md), [020](../adr/020-escala-de-elevacion.md), [021](../adr/021-sistema-de-movimiento.md) |
| [`tablero.html`](tablero.html) | Maqueta viva del shell y el tablero con el sistema aplicado: rail de la barra lateral, arrastre real, resalte en tiempo real, paleta ⌘K, drawer de tarea. | [021](../adr/021-sistema-de-movimiento.md), [022](../adr/022-rail-de-barra-lateral.md) |
| [`gantt.html`](gantt.html) | Maqueta viva del Gantt con el sistema aplicado —la única vista que el rediseño no tocó—: barras finas de teal suave sin texto (la identidad vive en el riel), jerarquía visible (orden de árbol + dos grosores de barra: tarea y subtarea), riel de una línea con color por prioridad, líneas de dependencia fin→inicio, columna del día actual sombreada, cabecera de dos bandas, zoom Día/Semana/Mes/Trimestre con `‹ Hoy ›`, arrastrar y redimensionar reales. | [018](../adr/018-escala-tipografica.md)–[021](../adr/021-sistema-de-movimiento.md); `023` (zoom y bandas, pendiente) |
| [`barra-lateral.html`](barra-lateral.html) | La barra lateral partida en tres grupos —espacio personal, administración y proyectos—, con el grupo de administración sujeto a permisos. Conmuta entre quien administra y quien no, entre barra abierta y raíl, y entre tema claro y oscuro. Los rellenos de Hoy, Planificador y Cronograma enseñan el cronómetro por fila, el panel derecho de tarea, la capacidad por día y la proyección por horas. | [036](../adr/036-barra-lateral-en-tres-espacios.md) |

## Cómo abrirlas

Ábrelas en el navegador (doble clic o `file://`). Cargan Geist desde Google
Fonts; sin red caen a la fuente del sistema. No necesitan servidor ni build.

La **franja oscura de arriba es andamiaje de la maqueta**, no producto: desde
ahí se conmutan tema, densidad, movimiento y —en `tablero.html`— la variante de
cabecera y dos simulaciones. En `gantt.html` conmuta además el zoom, el origen
del color del riel (prioridad / estado / neutro), las líneas de dependencia y el
estado vacío. La aplicación real no la lleva.

## Origen y límites

- Los tokens marcados «Actual» se copiaron textualmente de
  `apps/web/src/index.css` y `docs/marca.md`. Los marcados «Propuesto» son lo
  que deciden los ADR 018–022.
- El color y el símbolo **no** se tocan: cerrados en
  [`marca.md`](../marca.md) y [ADR 005–007](../adr/).
- Cabecera: se eligió la **opción A** (búsqueda en la barra lateral, cabecera
  contextual fina). La variante B —topbar global— está en `tablero.html` tras
  el conmutador «Cabecera», descartada.
- Las maquetas revisadas con las skills `impeccable` y `ui-ux-pro-max`
  (registro *product*): accesibilidad, estados de interacción, movimiento y
  anti-patrones.
- `gantt.html` es la pasada visual previa a la Fase 6 para esa vista. Decisiones
  tomadas antes de tocar el componente: barras **finas y sin texto** (píldora de
  **teal suave** —`--brand` al ~22%—, progreso como tramo de teal más saturado;
  la identidad de la tarea vive en el riel, no en la barra; las tareas hechas se
  atenúan; la barra **ancla en el centro** del día de inicio y del de fin, así
  que una tarea de un solo día sale como un punto sobre ese día; **la columna
  del día actual va sombreada** —se descartó la línea vertical con etiqueta
  «hoy», que se solapaba con el número del día—, sin sombreado de finde, líneas
  verticales solo en el límite de la unidad mayor); **jerarquía visible**
  (orden de árbol, sangría del riel con codo, y **dos grosores de barra**: uno
  para la tarea de primer nivel y otro para cualquier subtarea, sea del nivel
  que sea); densidad **más compacta** que la del tablero
  (fila = `calc(--density-row - 0.3rem)`, meta del riel solo al hover); **zoom**
  Día/Semana/Mes/Trimestre con bandas de cabecera que se adaptan y navegación
  `‹ Hoy ›`; **riel de una línea** (ID + título, barra de **prioridad** de 3px,
  resto en tooltip); **líneas de dependencia** fin→inicio (hairline en
  `muted-foreground`); y validación con esta maqueta antes de la implementación.
  El sombreado de fin de semana se descartó por imperceptible. Las líneas de
  dependencia entran en la implementación como capa **solo lectura** (leen
  relaciones ya existentes); crearlas y editarlas es Fase 6.

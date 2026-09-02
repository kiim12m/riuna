# ADR 022 — Rail de iconos en la barra lateral

**Fecha:** 2026-09-02 · **Estado:** aceptada

**Contexto.** `AppSidebar` usa `collapsible="offcanvas"`: al contraerla
**desaparece entera** y el contenido ocupa todo el ancho. No hay estado
intermedio. Quien trabaja con la barra cerrada pierde de vista los proyectos y el
cambio de espacio de trabajo, y volver a ellos es un gesto de dos pasos.

**Decisión.** Añadir un estado de **rail de iconos** (~52 px): los proyectos se
ven como iniciales con *tooltip*, los enlaces de navegación como icono con
*tooltip*, y el conmutador de espacio de trabajo queda como distintivo. La
transición de ancho usa `--motion-slow` ([ADR 021](021-sistema-de-movimiento.md)).
Se conmuta desde el pie de la barra y desde el disparador de la cabecera. En
móvil la barra sigue abriéndose como panel (`Sheet`), sin rail.

**Consecuencias.**
- Tres estados en vez de dos: abierta, rail, oculta (móvil). El rail es el nuevo
  por defecto de quien quiere sitio sin perder orientación.
- Encaja con «el contenido primero, el chrome callado» de [`marca.md`](../marca.md)
  §06: el rail es chrome mínimo, no ausencia de chrome.
- Decisión relacionada, tomada a la vez: **la búsqueda / paleta ⌘K se queda en la
  barra lateral** (opción A), no se promueve a una topbar global. La cabecera de
  proyecto sigue fina: migas y pestañas de vista. La variante con topbar se
  maquetó y se descartó.
- Referencia visual: [`design-previews/tablero.html`](../design-previews/tablero.html),
  botón de contraer al pie de la barra; conmutador «Cabecera» para ver la
  variante descartada.

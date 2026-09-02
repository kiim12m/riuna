# Previews de diseño

Maquetas HTML autónomas del rediseño visual e interactivo previo a la Fase 6.
Se decidió sobre ellas antes de tocar `apps/web`; quedan aquí como referencia
de qué se acordó y de cómo debe verse y comportarse.

| Fichero | Qué es | ADR que respalda |
|---|---|---|
| [`sistema-base.html`](sistema-base.html) | Specimen del lenguaje base: color, tipografía, densidad, elevación, radios, movimiento, estados y vocabulario. | [018](../adr/018-escala-tipografica.md), [019](../adr/019-densidad-configurable.md), [020](../adr/020-escala-de-elevacion.md), [021](../adr/021-sistema-de-movimiento.md) |
| [`tablero.html`](tablero.html) | Maqueta viva del shell y el tablero con el sistema aplicado: rail de la barra lateral, arrastre real, resalte en tiempo real, paleta ⌘K, drawer de tarea. | [021](../adr/021-sistema-de-movimiento.md), [022](../adr/022-rail-de-barra-lateral.md) |

## Cómo abrirlas

Ábrelas en el navegador (doble clic o `file://`). Cargan Geist desde Google
Fonts; sin red caen a la fuente del sistema. No necesitan servidor ni build.

La **franja oscura de arriba es andamiaje de la maqueta**, no producto: desde
ahí se conmutan tema, densidad, movimiento y —en `tablero.html`— la variante de
cabecera y dos simulaciones. La aplicación real no la lleva.

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

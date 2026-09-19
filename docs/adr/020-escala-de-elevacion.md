# ADR 020 — Escala de elevación

**Fecha:** 2026-09-02 · **Estado:** aceptada

**Contexto.** `apps/web` no tiene escala de sombra. Cada superficie elevada
—`Card`, `Frame`, `Dialog`, `Tooltip`, `Toast`— combina a mano los
`shadow-xs/sm/md` de Tailwind con un `before:` de un pelo de sombra repetido en
cinco sitios. No hay forma de decir «esto está al nivel de un popover» sin copiar
valores.

**Decisión.** Cuatro tokens en `apps/web/src/index.css` —`--elevation-1`
(reposo: tarjeta, fila, chip), `--elevation-2` (elevada: hover, arrastrando),
`--elevation-3` (popover, menú, tooltip, toast), `--elevation-4` (dialog,
drawer)— más `--elevation-hairline` para el filo interior de 1 px que ya se hace
a mano. En claro la sombra lleva **sesgo navy** (no negro puro, como los grises
de [`marca.md`](../marca.md) §04); en oscuro es negro con un filo de luz arriba.

**Consecuencias.**
- Los cinco componentes que hoy hacen el `before:` a mano pasan al token; el
  resultado es equivalente, deja de estar copiado.
- El sesgo navy es coherente con «los grises no son grises». Un `box-shadow`
  neutro al lado del chrome navy delata que no se eligió.
- No se toca el radio ni se añaden niveles: cuatro cubren reposo, hover, popover
  y overlay, que es todo lo que la aplicación apila.
- Referencia visual: [`design-previews/sistema-base.html`](../design-previews/sistema-base.html),
  sección «Elevación», en los dos temas.

# ADR 028 — Un solo control segmentado

**Fecha:** 2026-09-07 · **Estado:** aceptada

**Contexto.** La elección excluyente de dos a cinco opciones cortas se había
escrito a mano **tres veces**, con dos aspectos distintos: el zoom del Gantt
(`role="group"`, `Button ghost`, `bg-accent` más una barra de marca de 2 px
abajo), y el conmutador de unidad de Ciclos y el de vencimiento de «Mi trabajo»
(`bg-muted/40` sobre `bg-background` con `shadow-e1`). Los dos últimos **no
tenían ninguna señal de foco de teclado**, y en tema oscuro no se distinguía la
opción activa: `--muted` ya es blanco al 5 %, así que `bg-muted/40` queda en ~2 %,
el seleccionado era `bg-background` —el mismo color que el fondo de la página— y
`shadow-e1` en oscuro es una sombra negra sobre suelo oscuro. Quedaba solo el
color del texto, que es lo que prohíbe [`marca.md`](../marca.md) §06 principio 2.
`components/ui/toggle-group.tsx`, que envuelve `ToggleGroup` de Base UI y ya trae
foco, estados `data-pressed` y recorrido con flechas, existía sin usarse.

**Decisión.** Un `SegmentedControl` en `apps/web/src/components/ui/`, sobre
`ToggleGroup` en modo selección única, con el tratamiento visual del Gantt:
`bg-accent` **más** `inset 0 -2px 0 var(--brand)` en el seleccionado. Migran los
tres sitios. `label` es obligatorio y se traduce a `aria-label` del grupo. El
componente ignora el valor vacío que Base UI emite al volver a pulsar la opción
activa: un filtro siempre tiene un valor.

**Consecuencias.**
- El estado se codifica en forma —la barra de marca— además de en color, así que
  se lee en los dos temas y sin distinguir tonos.
- El foco de teclado deja de faltar en dos de las tres pantallas, y las flechas
  recorren el grupo, que a mano no hacía ninguna.
- Se descarta `aria-pressed` sobre botones sueltos: para una elección excluyente
  la semántica de grupo anuncia «1 de 4», y `aria-pressed` no anuncia nada en las
  opciones no elegidas.
- La regla de tres de `AGENTS.md` se aplica aquí de forma literal: la tercera
  copia es la que paga la abstracción, no la primera.

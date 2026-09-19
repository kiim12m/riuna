# ADR 019 — Densidad configurable: `.compact-mode` con reglas reales

**Fecha:** 2026-09-02 · **Estado:** aceptada

**Contexto.** `apps/web/src/hooks/use-user-preferences-effects.ts` conmuta la clase
`.compact-mode` en `<html>` según la preferencia del usuario, pero **no hay ni una
regla CSS detrás**: elegir «compacta» hoy no cambia nada. La densidad es un valor
de marca ([`marca.md`](../marca.md) §06 principio 3: «ver 30 tareas sin scroll
vale más que el aire entre dos»), y no se puede ajustar.

**Decisión.** Definir un grupo de tokens `--density-*` (alto de fila, alto de
control, relleno de tarjeta, separaciones, gap de columna) con valores «cómoda»
por defecto en `:root`, y redefinirlos bajo `:root.compact-mode` (fila 2,25 →
1,75 rem, control 2 → 1,75 rem, relleno 0,75 → 0,5 rem, cuerpo 14 → 13 px, y los
gaps proporcionales). Los componentes de listas, tarjetas y controles consumen
los tokens en lugar de valores fijos.

**Consecuencias.**
- «Compacta» deja de ser una preferencia inerte. Es la densidad de quien tiene el
  tablero lleno, no una versión degradada.
- El ajuste de cuerpo a 13 px en compacta es la única desviación de la escala del
  [ADR 018](018-escala-tipografica.md), acotada a ese modo.
- Alcance inicial: tablero, lista, backlog, vista Tabla y controles de formulario.
  El resto se pasa cuando toque.
- Referencia visual: [`design-previews/sistema-base.html`](../design-previews/sistema-base.html),
  sección «Densidad» (conmutador arriba).

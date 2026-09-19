# ADR 021 — Sistema de movimiento

**Fecha:** 2026-09-02 · **Estado:** aceptada

**Contexto.** `apps/web` tiene un solo `@keyframes` a mano (el shimmer del
skeleton), `framer-motion` en 8 ficheros y siempre el mismo *fade*. No hay
transiciones de ruta ni *stagger*. Y los cambios que llegan por WebSocket
**aparecen de golpe**: `use-project-websocket` solo invalida queries de TanStack
Query, sin ninguna señal en pantalla. Eso incumple el principio 5 de
[`marca.md`](../marca.md) §06: «lo que es en tiempo real, lo parece».

**Decisión.** Un juego de tokens de movimiento en `apps/web/src/index.css`:
duraciones `--motion-instant` 90 · `--motion-fast` 140 · `--motion-base` 220 ·
`--motion-slow` 360 · `--motion-settle` 760 ms; `--ease-out-quart` junto a los
`--ease-out`/`--ease-in-out` que ya existen; `--stagger-step` 38 ms. Reglas:
entradas con `--ease-out-quart` y sin rebote; **las salidas duran ≈ 65 % de la
entrada**; el resalte de «cambiado por otra persona» es un baño de `accent` que
decae en `--motion-settle`, enganchado a los eventos de `use-project-websocket`.
Todo cae a opacidad/instantáneo bajo `prefers-reduced-motion` o el ajuste del
usuario; el resalte deja entonces un tinte estático breve, no desaparece sin
rastro.

**Consecuencias.**
- El principio 5 pasa de aspiración a implementación: mover una tarjeta desde otra
  sesión se ve moverse y se resalta.
- Sin rebote ni *spring* con `bounce`: la marca no es juguetona, y una interfaz
  que se lee cien veces al día se cansa antes que quien la lee.
- `framer-motion` se mantiene donde ya está; lo nuevo es CSS con tokens. No entra
  dependencia.
- Referencia visual: [`design-previews/sistema-base.html`](../design-previews/sistema-base.html)
  (sección «Movimiento», demos en vivo) y
  [`tablero.html`](../design-previews/tablero.html) (botón «Simular: Ana mueve
  una tarea»).

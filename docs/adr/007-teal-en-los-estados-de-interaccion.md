# ADR 007 — El teal entra en los estados de interacción

**Fecha:** 2026-08-24 · **Estado:** aceptada · Sustituye el mapeo de la [ADR 005](005-sistema-de-marca.md)

**Contexto.** El *brand system* de partida pedía River Teal literal en `--accent`. La [ADR 005](005-sistema-de-marca.md) lo descartó —es la opción B de la comparativa del espécimen visual— y dejó el hover en un tinte de navy al 5 %, con el teal reservado a acción, foco y estado activo. Se decide ahora aplicar el documento de partida al pie de la letra.

**Decisión.** Llevar River Teal a los estados de interacción, cambiando solo los cuatro tokens que separaban la opción A de la B:

| Token                        | Claro                   | Oscuro                        |
|------------------------------|-------------------------|-------------------------------|
| `--accent`                   | River Teal al 10 %      | teal claro al 14 %            |
| `--sidebar-accent`           | River Teal al 12 %      | teal claro al 16 %            |
| `--sidebar-accent-foreground`| `#0B7466`               | `#5FD3C0`                     |
| `--accent-foreground`        | sin cambio (tinta)      | sin cambio (texto de noche)   |

Lo que **no** cambia: `--primary` sigue en Deep Navy, y `--brand`, `--brand-strong`, `--ring`, `--muted` y `--secondary` se quedan como estaban. Esto es la opción B, no la C: el botón primario no se vuelve teal.

**Consecuencias.**

- **La regla de oro de [`marca.md`](../marca.md) §04 se matiza por escrito.** «Una sola acción en teal por pantalla» pasa a aplicarse al teal sólido —botón, enlace, anillo de foco—; el tinte de interacción no cuenta. Sin ese matiz quedaría una regla que ninguna pantalla puede cumplir.
- **El teal deja de significar solo «aquí se puede hacer algo».** En hover y en fila activa significa «el ratón está encima». Es el coste conocido de la opción B y está registrado en el espécimen desde antes de aplicarla.
- **Contraste verificado en los dos temas.** `#0B7466` sobre la barra lateral clara teñida al 12 % da 4,57:1 —pasa, pero con poco margen sobre el 4,5:1—; `#5FD3C0` sobre la oscura teñida al 16 %, 7,6:1. Medidos en el navegador sobre el tinte real, no a mano.
- **Un valor derivado nuevo**, `teal-200` `#5FD3C0` (`--riuna-teal-lighter`): `#2AB39F` sobre su propio tinte se queda en 5,3:1, y el estado activo es texto.
- **En la barra lateral, hover y elemento activo comparten `--sidebar-accent`** (`components/ui/sidebar.tsx`), así que comparten tinte. La maqueta los distinguía al 12 % y al 15 %; la aplicación no, y no se separan por no duplicar un token que nadie más necesita.
- **Las etiquetas de grupo de la barra lateral pasan a teal.** «Proyectos» y «Equipos» pintan con `--sidebar-accent-foreground` (`nav-main.tsx`, `nav-projects.tsx`), que ahora es teal. Consecuencia aceptada.
- **Cuatro componentes fijaban el estado a mano y el token solo no llegaba a ellos.** La barra lateral apagaba el hover con `hover:bg-transparent` (`nav-main.tsx`, `nav-projects.tsx`): ahora tiñe al 60 % del token, por debajo del elemento activo, que se queda al 100 % con texto teal. Las pestañas de vista marcaban la activa con `variant="secondary"`, es decir gris (`project-layout.tsx`, `mobile-project-nav.tsx`): pasan al tinte de `--accent` más un raíl de 2 px en `--brand` —3,74:1 en claro y 5,77:1 en oscuro, por encima del 3:1 de componente—. Y la tarjeta del tablero tiñe de teal el borde al pasar por encima (`task-card.tsx`), como hace la maqueta, en vez de reforzar el gris. Un mapeo de tokens no basta cuando el componente escribe el estado a mano.
- **A vigilar.** El raíl de la pestaña activa y el borde de hover de la tarjeta son los primeros consumidores de `--brand`; `--brand-strong` y `--brand-foreground` siguen sin usarse. Mientras el teal sólido se limite a eso y al anillo de foco —que ahora cae sobre fondos también teñidos de teal—, el color de marca señala sobre todo dónde está el ratón. Es justo el riesgo que evitaba la opción A.

**Documento de referencia:** [`docs/marca.md`](../marca.md) §04, que manda sobre esta ADR en todo lo que sean valores concretos.

# ADR 005 — Sistema de marca: Deep Navy sostiene, River Teal actúa

**Fecha:** 2026-08-24 · **Estado:** aceptada; el mapeo sobre los tokens queda sustituido por la [ADR 007](007-teal-en-los-estados-de-interaccion.md)

**Contexto.** Riuna heredó de Kaneo una paleta neutra (escala `neutral` de Tailwind, sin color de marca) y sus logotipos. La Fase 0 dejó explícita la deuda: «logos y favicon siguen siendo los de Kaneo». Existía además un *brand system* de partida (v1.0, mayo 2026) que definía paleta y símbolo, pero describía otro producto —un constructor de diagramas de proceso— y solo cubría el tema claro.

**Decisión.** Adoptar la paleta del documento de partida y llevarla a los tokens con el mapeo **A**: `--primary` en Deep Navy `#1B3A5C`, y River Teal reservado para acción, foco y estado activo a través de tres tokens nuevos (`--brand`, `--brand-strong`, `--brand-foreground`). El fondo de hover (`--accent`) se queda neutro, teñido de navy al 5%, en vez de recibir el teal.

Se descartaron las otras dos opciones tras compararlas sobre interfaz real:

- **B**, el teal literal en `--accent` como pedía el documento de partida, tiñe todos los hover y filas activas. El teal deja de señalar «aquí se puede hacer algo» y pasa a señalar «el ratón está encima»: la regla de una sola acción destacada por pantalla se rompe sin que nadie la rompa a propósito.
- **C**, teal en los botones primarios y barra lateral en navy sólido, hace que el chrome pese más que el trabajo. Choca con «el contenido primero».

**Restricción que impone el color.** River Teal da 4,25:1 sobre blanco, por debajo del 4,5:1 de WCAG AA para texto normal. De ahí los dos tokens: `--brand` (`#0E8A7A`) para trazo, icono, borde y anillo de foco, donde el umbral es 3:1; y `--brand-strong` (`#0B7466`, 5,67:1) para texto y para rellenos que llevan texto encima.

**Consecuencias.**

- El tema oscuro se deriva entero, porque el documento de partida no lo cubría. Deep Navy no funciona como color de acción sobre fondo oscuro —es más oscuro que el propio fondo elevado—, así que en oscuro el peso de marca lo lleva `#2AB39F` y el navy se retira a superficies.
- **El verde de éxito se mueve de esmeralda (160°) a verde puro (`#16A34A`, 142°).** Con River Teal como color de acción, el esmeralda quedaba a doce grados de tono y confundía «esto es un botón» con «esto ha salido bien». Por la misma razón la etiqueta «Sage» pasa de `emerald-600` a `cyan-600`; su `value` en base de datos sigue siendo `teal`, así que no hay migración.
- Las cuatro prioridades pasan a tener cuatro colores. Antes media y alta eran el mismo ámbar a distinta opacidad.
- Los neutros dejan de ser neutros: `#4A6380`, `#D8DDE5` y `#F6F7F9` llevan sesgo azul. No sustituir por la escala `neutral` de Tailwind.
- Los bordes ganan peso: `#D8DDE5` frente al negro al 8% heredado. Es el valor que fija el manual.
- El logotipo se compone en el cliente —SVG inline más la Geist de la aplicación— en lugar de servirse como imagen. Así el arco navy y los nodos heredan de `currentColor` y siguen al tema sin duplicar archivos, y no hace falta trazar la tipografía en un asset aparte.
- Los PNG de icono se generan desde la geometría del símbolo con un script sin dependencias; no hay rasterizador de SVG en el entorno de desarrollo.
- Tipografía sin cambios: Geist se queda. Es una decisión aparte, razonada en el manual.

**Documento de referencia:** [`docs/marca.md`](../marca.md), que manda sobre esta ADR en todo lo que sean valores concretos. Aquí queda el porqué; allí, el qué.

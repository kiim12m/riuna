# ADR 006 — El símbolo: anillo partido con nodos inversos

**Fecha:** 2026-08-24 · **Estado:** aceptada

**Contexto.** El documento de marca de partida describía el símbolo en una línea: «dos nodos conectados con arcos, arco superior navy, arco inferior teal». La primera interpretación —una lente inclinada de radio 14— quedó aplicada en [ADR 005](005-sistema-de-marca.md) marcada como pendiente de revisión, porque tenía un defecto medible: por debajo de 24 px los nodos se comían el hueco interior y la figura se cerraba en una mancha.

**Decisión.** Anillo de radio 10 centrado en la retícula, cortado en diagonal a 135° y 315°, con un nodo en cada corte. **Cada nodo es el negativo del otro:** navy fuera y teal dentro donde el trabajo entra, teal fuera y navy dentro donde sale. El arco teal va más grueso que el navy (3,6 contra 2,6).

**Por qué esta y no las otras.** Se dibujaron y rasterizaron 44 variantes en seis rondas, no se descartó nada sobre el papel. Lo que las tumbó:

- **Lente abierta** (el mismo dibujo con radio 10,6-11,5, que arreglaba el empaste): se lee aplastada.
- **Meandro**, la más bonita del conjunto: pierde los nodos, y con ellos lo único que el símbolo dice del producto.
- **Confluencia**, que sobre el papel era la que mejor encajaba con el claim: dibujada se lee como una flecha.
- **Órbita** y **anillo sin nodos**: impecables al reducir y podrían ser el logotipo de cualquier cosa.
- **Un solo nodo**: deja la segunda juntura sin resolver y se nota, aunque cueste señalar por qué.
- **Nodo hueco** en lugar del núcleo: dice lo mismo y aguanta menos, porque un aro se cierra antes que un disco de dos colores.

**Consecuencias.**

- **El símbolo tiene dos niveles de detalle, no uno.** El núcleo no cabe por debajo de ~32 px, así que la versión simplificada —nodos macizos, navy el de entrada y teal el de salida— es la que va en el favicon y en las entradas de 16 y 32 px del `.ico`. Agrandar el núcleo no es salida: se come el nodo.
- La geometría vive en tres sitios que hay que mantener sincronizados: `scripts/brand/render-icons.mjs`, `apps/web/public/favicon.svg` y `apps/web/src/components/common/logo.tsx`.
- Queda especificada una **variante ampliada** —dos arcos más, fuera del anillo, uno por color— para usos con espacio: portadas, iconos grandes, impresión. No está implementada y no bloquea nada.
- Los nodos inversos son la primera pieza del sistema donde los dos colores de marca aparecen juntos en el mismo elemento, en vez de repartirse la figura. Si alguna vez se diseña un patrón o una ilustración de marca, ese es el recurso que hay que continuar.

**Documento de referencia:** [`docs/marca.md`](../marca.md) §03, que manda sobre esta ADR en todo lo que sean valores concretos.

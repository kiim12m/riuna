# ADR 061 — La administración, en el menú del avatar

**Fecha:** 2026-10-03 · **Estado:** aceptada · Cambia la [ADR 036](036-barra-lateral-en-tres-espacios.md)

**Contexto.** La ADR 036 puso la barra lateral en tres grupos: espacio
personal, administración y proyectos. Con el interludio de productividad el
espacio personal creció a siete entradas, y «Personal» llegó a «Proyectos»
(ADR 051). Al verlo con datos reales, el usuario pidió limpiar la barra y
sacar de ella la administración.

**Decisión.**

- **La administración va al menú del avatar**, debajo de «Ajustes», como
  sección «Administración»: Proyectos, Miembros y equipos, Espacio y Ajustes
  de proyecto. La barra queda con el espacio personal y los proyectos.
- **«Objetivos» también sale de la barra**: por ahora no se usa. La página
  sigue en `…/goals`, en la paleta y en el widget de objetivo de «Mi panel»;
  volver a enseñarla es devolver una entrada a `nav-main.tsx`.
- **Las mismas puertas que antes** (`useAdminNavItems`): cada entrada sale
  solo con su capacidad, nunca por el rol, y sin ninguna no se ve ni la
  etiqueta. Las rutas `…/admin/…` y su layout no cambian.

**Consecuencias.**

- **Un clic más para administrar**, a cambio de una barra más corta para
  todo el mundo, la mayoría de los días sin nada que administrar.
- **Ninguna entrada de la barra sale ya marcada en una página de
  administración**; la página se reconoce por su propio menú.
- **Esconder no es autorizar:** la API sigue exigiendo el permiso en cada
  ruta, como en la ADR 036.

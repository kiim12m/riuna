# ADR 031 — «Mi trabajo» y «Panel» se funden en uno

**Fecha:** 2026-09-08 · **Estado:** aceptada ·
**Modifica la [ADR 024](024-mi-trabajo-y-bandeja.md)**

**Contexto.** La Fase 6 dio a Riuna «Mi trabajo»: dos secciones fijas —lo tuyo y
lo de tus equipos— más la bandeja como pestaña. La Fase 7 añadió «Panel»: una
rejilla de widgets configurables. Eran **dos respuestas a la misma pregunta**
—«¿qué me toca?»— en dos pantallas contiguas de la barra lateral, una rígida y
otra vacía al empezar. Quien entraba tenía que elegir entre una lista que no
podía cambiar y una rejilla que tenía que montar.

**Decisión.** Una sola pantalla, `/dashboard/workspace/$id/home`, con una
**distribución de partida** que se siembra la primera vez y a partir de ahí es
del usuario. Las dos secciones de «Mi trabajo» pasan a ser dos widgets de tabla
con ámbito personal, y la bandeja un widget más. `/my-work` y `/panel` redirigen.

**Consecuencias.**

- **El ámbito personal deja de ser una pantalla y pasa a ser una propiedad de
  cualquier widget.** `config.scope` vale `assigned` o `team`, y se apoya en los
  mismos predicados medidos que tenía la página: la valla `OFFSET 0` (197 → 47 ms)
  y la resolución de equipos con `selectDistinct`, ahora en `my-work/scope.ts`
  para que las dos lecturas no puedan divergir.
- **La siembra la vigila la base, no el controlador.** El panel de partida se
  crea al leer, así que dos cargas simultáneas la primera vez crearían dos: lo
  corta el índice único parcial `dashboard_one_default_per_person`, el mismo
  patrón que `cycle_one_active_per_project`. Perder la carrera no es un error, es
  releer.
- **La pertenencia se sigue empujando.** `MY_WORK_INVALIDATED` invalida ahora
  también `["dashboard-data"]`. Sin eso, fundir las pantallas habría costado que
  una tarea recién asignada tardara hasta un minuto en aparecer, y la página
  vieja la enseñaba al momento. El resto del contenido sigue llegando por el
  intervalo de 60 s, por la razón que la ADR 024 ya escribió.
- **Se pierden los filtros de página.** «Mi trabajo» tenía tres controles
  —vencimiento, proyecto, completadas— que valían para toda la pantalla. En una
  rejilla cada widget lleva el suyo, que es más flexible y menos inmediato. La
  distribución de partida incluye un reparto por ventana de vencimiento para que
  la pregunta que respondía el filtro siga respondida sin tocar nada.
- **La bandeja deja de ser una página.** Sigue siendo la misma consulta
  `["notifications"]` que la campana —marcar leído actualiza las dos—, pero
  enseña ocho y no cincuenta. La campana sigue estando y el tope de 50 sin
  paginar sigue siendo deuda declarada desde la Fase 6.
- **`GET /api/my-work/tasks` se queda sin consumidor web.** La ruta, su OpenAPI y
  sus pruebas siguen ahí: es una lectura pública documentada y una clave de API
  puede usarla. Retirarla es una decisión sobre la superficie pública, no un
  efecto secundario de mudar una pantalla, y por eso no se toma aquí.
- **Se toma la arquitectura de la referencia, no su estética.** Saludo con fecha,
  rejilla de tarjetas, rótulo en versalitas, cifra grande, barra de progreso y
  línea de tendencia. No entran el magenta ni las ilustraciones: el magenta no
  está en la paleta y `marca.md` §04 está cerrado, y meter arte dentro de una
  tarjeta de datos contradice el principio 1 —«el contenido primero, el chrome
  callado»—. La referencia además traía tarjetas de objetivos, notas y finanzas:
  los objetivos son la rebanada 3 de esta fase, y notas y finanzas no existen.
- **Un reparto de cuatro cubos o menos se dibuja como lista, no como barras.**
  Dentro de una tarjeta, cuatro barras son una tabla con pasos de más, y la lista
  deja poner la cifra exacta al lado del nombre.
- **Los títulos sembrados van en español y como texto literal.** Son editables
  desde el primer momento, así que una clave de i18n dejaría de tener sentido en
  cuanto alguien renombrase uno. Los `DEFAULT_PROJECT_COLUMNS` están en inglés,
  pero eso es deuda heredada de Kaneo, no un criterio que extender a la pantalla
  principal del producto.

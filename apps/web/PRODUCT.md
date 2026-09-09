# Product

<!-- impeccable:product-schema 1 -->

> Verdad de producto de Riuna. Vive en `apps/web/` porque es donde la busca la
> herramienta, pero describe **el producto entero**, no solo el cliente web.
> La autoridad de marca es [`docs/marca.md`](../../docs/marca.md), que tiene
> gobernanza propia en su §09: sus secciones 01–07 no se cambian desde aquí.

## Platform

web

## Users

Una persona, principalmente: la que instala, mantiene y usa Riuna a diario.
Ocasionalmente entra alguien más. **No es una herramienta de equipo grande**, y
eso es un hecho de producto, no una fase temprana.

Escena real de uso: escritorio, pestaña fija junto al trabajo de verdad, durante
toda la jornada. El móvil es **consulta puntual** — mirar cómo va algo, leer una
notificación. Nadie crea ni mueve tareas desde el teléfono.

Consecuencia para el diseño: la colaboración, los permisos finos y el alta de
nuevas personas pesan menos de lo que su superficie de código sugiere. Lo que
pesa es la velocidad de lectura y que el panel resuma bien.

## Product Purpose

Que un equipo pequeño vea el estado real de su trabajo sin tener que
reconstruirlo mentalmente a partir de cinco pestañas.

Reúne en un sitio lo que hoy se reparte entre varias herramientas: gestión de
proyectos y tareas primero; CRM y ERP ligero después.

## Positioning

Autoalojada y de uso interno, sin promesa comercial ni tono de venta. Es un
*fork* duro de Kaneo v2.22.0 (MIT) mantenido como programa independiente: **no
hay sincronización con el origen**, así que tocar código heredado no cuesta
integraciones futuras.

Claim propuesto, **pendiente de aprobar y sin aparecer todavía en la interfaz**:
«Un solo cauce para todo el trabajo».

## Operating Context

- Instancia única autoalojada. Postgres para estado durable; eventos y WebSockets
  mantienen los clientes al día. Redis es **opcional** y solo coordina el tiempo
  real entre varias instancias de API.
- Despliegue en dos formas: mismo origen empaquetado, o API y web alojados por
  separado. Ambas son de primera clase.
- El trabajo vive en espacios de trabajo → proyectos → tareas, con vistas que son
  lentes sobre las mismas tareas (tablero, tabla, calendario, Gantt, ciclos), no
  módulos con lógica propia.

## Capabilities and Constraints

- **Instalable por terceros.** El autoalojado de una sola instancia no puede
  pasar a depender de un servicio gestionado sin una decisión de producto
  explícita.
- **Castellano y catalán a la par.** `i18n/en-US.json` es la fuente de claves;
  el español es el idioma por defecto del producto. El catalán **no es un extra**:
  una traducción a medias cuenta como fallo, no como carencia.
- **El formato SERVITEC se conserva.** La exportación que reproduce el cuadro de
  `Tareas- SERVITEC 2026.xlsx` es un compromiso con un cliente real: mismo nombre
  de hoja, cabeceras, fila de leyenda y columnas. No se «mejora».
- **Densa a propósito.** 14 px de cuerpo y 12 px de metadatos. Ver treinta tareas
  sin desplazarse vale más que el respiro entre dos.
- Toda importación es idempotente vía `external_ref`: reimportar actualiza, nunca
  duplica.
- Presupuesto de rendimiento: cualquier vista pagina y responde por debajo de
  300 ms p95 con 50.000 tareas, comprobado con `EXPLAIN`, no razonado.

**Sin decidir, y no debe inventarse:** el claim (arriba), la variante ampliada
del símbolo, y el repaso de tono de las ~1.960 claves × 3 idiomas.

## Brand Commitments

- Nombre **Riuna**; suena a río, y de ahí salen Deep Navy y River Teal.
- Manual de marca completo en `docs/marca.md`: paleta, tipografía Geist (sans y
  mono), iconografía Lucide, escala tipográfica y principios de interfaz.
- **De Kaneo no se hereda nada más que el código**: ni logotipo, ni tono, ni
  paleta ([ADR 001](../../docs/adr/001-fork-duro-de-kaneo.md)).
- Tono: sin lenguaje comercial. Riuna no vende, informa.
- Regla de oro del color: «Navy sostiene. Teal actúa. Todo lo demás calla.»

## Evidence on Hand

- `docs/marca.md` — manual de marca de 31 KB con gobernanza.
- `docs/plan.md` — hoja de ruta por fases y su estado real.
- `docs/adr/` — decisiones estructurales, una por cambio.
- `apps/api/src/task/exports/servitec-workbook.ts` — el cuadro de SERVITEC
  reproducido de una hoja mantenida a mano.

**Ausencias que no se pueden fabricar:** no hay sitio público de marketing, ni
clientes de referencia, ni testimonios, ni precios, ni licencias comerciales, ni
métricas de uso. Kaneo tenía sitio y documentación pública; se eliminaron en la
Fase 0 porque Riuna es interna.

## Product Principles

1. **Claro** — el estado del trabajo se lee de un vistazo. Si hay que abrir algo
   para saber cómo va, es un fallo de diseño.
2. **Fluido** — la herramienta no cobra peaje. Crear, mover y cerrar una tarea
   son gestos, no formularios.
3. **Preciso** — cada tarea tiene responsable, fecha y permiso exactos. La
   ambigüedad no se disimula con colores bonitos.
4. **Aditivo antes que invasivo** — la capacidad nueva llega como tablas y
   módulos nuevos junto a los heredados, no como reescrituras.
5. **Nada se pierde en silencio** — archivar, no borrar; y toda mutación deja
   actividad.

## Accessibility & Inclusion

WCAG AA es el suelo, y **en los dos temas**: 4,5:1 para texto, 3:1 para
componentes. Verificado, no supuesto.

- River Teal da 4,25:1 sobre blanco, por debajo de AA: **no es color de texto de
  párrafo**. Para relleno con texto encima o enlaces en prosa se usa `#0B7466`.
- **El estado no se codifica solo en color**: icono más color más texto. Nadie
  debe depender del tono para saber si una tarea es urgente.
- El móvil es consulta: las áreas táctiles y el desbordamiento importan; la
  paridad de funciones con el escritorio, no.

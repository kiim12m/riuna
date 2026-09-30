# Riuna — qué hace hoy

> Inventario de producto: lo que la aplicación sabe hacer a día de hoy.
> Lo que está planificado y todavía no existe vive en [`plan.md`](plan.md);
> lo que falla dentro de lo que sí existe, en la deuda abierta de cada fase
> del mismo documento.
>
> Complementarios: [plan de desarrollo](plan.md) ·
> [decisiones (ADR)](adr/) · [copias de seguridad](copias-de-seguridad.md)

Riuna es una plataforma de productividad **self-hosted**: gestión de proyectos
y tareas primero, CRM y ERP ligero después. Es un fork duro de
[Kaneo](https://github.com/usekaneo/kaneo) v2.22.0 mantenido como programa
independiente. A fecha de este documento están cerradas las fases 0 a 7.5 del
plan; las fases 8 (automatizaciones e importadores externos) y 9 (operación)
siguen pendientes.

---

## 1. Cuentas y acceso

- Registro e inicio de sesión con **email + contraseña**, **enlace mágico**,
  **código OTP por email**, y **usuario + contraseña** (cuentas locales sin
  correo real, creadas por el admin de instancia —
  [ADR 008](adr/008-cuentas-locales.md)).
- SSO: **GitHub, Google, Discord** y **OIDC/OAuth genérico** configurable
  (`CUSTOM_OAUTH_*`, con descubrimiento, PKCE, mapeo de perfil y logout
  federado).
- **Acceso invitado** anónimo, desactivable.
- **Vinculación de cuentas**: entrar por OAuth con el mismo correo enlaza con
  la cuenta existente en vez de crear una segunda.
- **El primer usuario es admin de instancia**, promocionado de forma atómica.
  Puede banear, suplantar, crear cuentas locales y asignarles correo.
- Interruptores de instancia: cerrar el registro, cerrar el registro por
  contraseña, quitar el OTP, ocultar el formulario local, quitar el acceso
  invitado, restringir la creación de espacios de trabajo, modo demo.
- **API keys** por usuario, con alcance de permisos, caducidad (1/7/30/90 días
  o nunca) y límite de 100 peticiones por minuto.
- **Device flow** para CLI y clientes MCP (`riuna-cli`, `riuna-mcp`).
- Antiabuso, solo en modo cloud: Turnstile en el registro, bloqueo de correos
  desechables y límites de tasa en el alta y en las invitaciones.
- Perfil: nombre, correo, **avatar con recorte**, idioma, y **borrado de
  cuenta** con purga de datos.

## 2. Espacios de trabajo, equipos y permisos

- **Espacios de trabajo** con nombre, descripción, logo y slug; transferencia
  de propiedad y borrado.
- **Miembros**: añadir por correo, cambiar rol, expulsar, revocar un alta
  pendiente, y gestionar cuentas locales (renombrar, asignar correo, cambiar
  contraseña, bloquear acceso).
- **El acceso lo concede el admin del espacio y es efectivo sin que la persona
  lo apruebe** ([ADR 035](adr/035-acceso-concedido-sin-aprobacion.md)). Quien ya
  tiene cuenta entra en el acto y recibe un aviso; quien no la tiene recibe un
  enlace para darse de alta —el que abre el registro aunque esté cerrado— y la
  pertenencia se materializa sola al crear la cuenta.
- **Equipos / departamentos** (máximo 10 por espacio): crear, renombrar,
  eliminar y gestionar miembros. Una tarea se puede asignar a un equipo entero
  ([ADR 010](adr/010-asignacion-a-equipos-y-multiples-asignados.md)).
- **Roles editables por espacio**: `viewer`, `member` y `admin` se siembran
  como filas modificables; `owner` es inmutable a propósito. La matriz de
  permisos cubre cuatro recursos:

  | Recurso | Acciones |
  |---|---|
  | `project` | create, read, update, delete, share |
  | `task` | create, read, update, delete, assign |
  | `label` | create, read, update, delete |
  | `workspace` | read, update, delete, manage_settings |

- La autorización es **siempre** de la API (`requireWorkspacePermission`).
  Ocultar una acción en la interfaz no es una comprobación de permisos. El
  alcance de una API key se intersecta con el rol de su dueño.

## 3. Proyectos

- Crear, renombrar, icono (selector buscable), descripción, **clave de ticket**
  (`PRO-123`, máximo 8 caracteres), archivar y eliminar.
- **Reordenar proyectos** arrastrándolos en la barra lateral.
- Lista de proyectos con progreso, fecha objetivo y estado.
- **Proyecto público**: URL de solo lectura sin sesión, con tablero y lista,
  detalle de tarea, tema claro/oscuro y copia del enlace.
- **Columnas del tablero** configurables: crear, renombrar, reordenar
  arrastrando, icono, color y marca de **columna final**, que es la que define
  «hecho».
- **Ajustes de jerarquía por proyecto**: cascada al cerrar, cascada al
  archivar y profundidad máxima.
- Aviso automático cuando el proyecto pasa de 5.000 tareas.

## 4. Tareas

**Campos**: título, descripción rica, estado/columna, prioridad (sin
prioridad, baja, media, alta, urgente), responsable principal, **asignados
múltiples**, equipo, fecha de inicio, fecha de vencimiento, estimación en
horas, etiquetas, épicas, ciclo, campos personalizados y número de ticket.

- **Árbol real de subtareas** a varios niveles: `parent_id` manda, con
  `path` y `depth` materializados y dos `CHECK` que vigilan la coherencia en la
  propia base de datos. Validación anti-ciclo al reparentar y cerrojo por
  proyecto en los cuatro escritores del árbol
  ([ADR 011](adr/011-arbol-de-tareas-y-epicas.md),
  [ADR 016](adr/016-cerrojo-de-arbol-por-proyecto.md)).
- **Agregados de la rama**: progreso, fechas heredadas, estimación y tiempo
  registrado, sumados y calculados al leer sobre el prefijo materializado. Una
  tarea archivada no entra en ningún agregado.
- **Cascada configurable**: cerrar y archivar se propagan hacia abajo.
- **Mover una tarea a otro proyecto** se lleva su rama entera y reclama
  números nuevos allí.
- **Épicas**: grupos transversales dentro del proyecto, muchos a muchos con las
  tareas, con fechas, orden y archivado.
- **Relaciones entre tareas**: bloquea, bloqueada por, relacionada con.
- **Operaciones masivas** sobre una selección: estado, prioridad, asignado,
  etiqueta, fecha de vencimiento, mover al backlog o al tablero, archivar y
  eliminar.
- **Menú contextual** con clic derecho sobre la tarjeta, con las acciones
  frecuentes.
- **Atajos en el detalle**: `s` estado, `p` prioridad, `a` asignado,
  `l` etiquetas, `d` fecha. `j` y `k` navegan entre tareas; `Tab` y
  `Shift+Tab` sangran y promueven en el modo jerarquía.
- Copiar el enlace de la tarea y **copiar el nombre de rama Git**.

**Editor de descripción y comentarios** (TipTap): menú slash, encabezados,
listas, **listas de tareas marcables**, citas, **bloques de código con
resaltado** (~35 lenguajes), **tablas**, **diagramas Mermaid**, **embeds de
YouTube**, **adjuntos arrastrando** el fichero (a S3 con URL prefirmada),
**@menciones** que generan notificación, y enlaces a otras tareas.

**Comentarios**: crear, y editar o borrar los propios. Los comentarios que
llegan de GitHub se espejan con su avatar y su enlace.

**Actividad**: historial por tarea de la creación y de los cambios de estado,
prioridad, título, fechas, asignaciones de persona y de equipo, anidado,
épicas, ciclo y movimientos entre proyectos.

## 5. Vistas

| Vista | Qué ofrece |
|---|---|
| **Tablero (Kanban)** | Arrastrar entre columnas y dentro de una columna, filtros, orden, búsqueda rápida y añadir tarea por columna |
| **Lista** | Agrupación por estado, equipo o **jerarquía**; secciones plegables; arrastrar para reparentar; archivar todas las completadas |
| **Backlog** | Secciones *planificadas* y *archivadas*, filtros, agrupación, orden y «mover todo» al tablero |
| **Tabla** | Hoja de cálculo con edición en línea, **campos personalizados como columnas**, filtros compuestos, cuatro modos de jerarquía y **vistas guardadas** |
| **Calendario** | Rejilla mensual, barras multi-día por fecha de inicio y de vencimiento, desbordamiento por día y filtros |
| **Gantt** | Zoom día/semana/mes/trimestre, arrastrar y redimensionar barras para cambiar fechas, **capa de dependencias**, rango de rama y filtros |
| **Ciclos** | Panel de sprint con métricas y gráficas |

**Motor de filtros** común a todas ([ADR 014](adr/014-motor-de-filtros.md)):
árbol `and`/`or`/`not` con los operadores `eq`, `neq`, `gt`, `gte`, `lt`,
`lte`, `contains`, `startsWith`, `in`, `notIn`, `isEmpty` y `isNotEmpty`, sobre
campos nativos, campos personalizados y pertenencia (épica, etiqueta,
asignado). El filtro vive en la URL, así que se comparte pegando el enlace.

**Vistas guardadas** ([ADR 015](adr/015-vistas-guardadas.md)): guardar el
filtro y el modo de jerarquía con un nombre, compartirlo con el espacio de
trabajo, y eliminarlo.

**Orden**: manual, fecha de creación, prioridad, vencimiento, título o número.

**Ámbito de árbol** en listados y exportaciones: solo las coincidentes, solo
las raíces, o con sus descendientes.

## 6. Campos personalizados

Diez tipos: texto, número, moneda, select, multi-select, fecha, casilla,
usuario, URL y relación ([ADR 013](adr/013-campos-personalizados.md)). Alcance
de proyecto o de espacio de trabajo, con obligatoriedad, orden y archivado
suave. Se crean desde el «+» de la vista Tabla y se rellenan en el detalle de
la tarea y en la propia tabla.

## 7. Ejecución y productividad personal

- **Ciclos / sprints** ([ADR 025](adr/025-ciclos-y-completed-at.md)): crear con
  nombre, objetivo y fechas; iniciar; y cerrar decidiendo qué pasa con lo que
  quedó sin terminar. Un solo ciclo activo por proyecto, garantizado por un
  índice parcial único. El informe trae **completadas, estimado, velocidad y
  horas registradas**, con **gráfico burndown** conmutable entre tareas y
  horas, **velocidad histórica** y **horas por persona**.
- **Tareas recurrentes** ([ADR 026](adr/026-tareas-recurrentes.md)): diaria,
  semanal con días concretos, o mensual con día del mes, con intervalo «cada
  N», y pausar y reanudar. Un trabajo cada cinco minutos las genera, con
  arrendamiento de líder para no duplicarlas en despliegues de varias réplicas.
- **Plantillas**: guardar un proyecto entero —columnas, épicas y tareas— o un
  árbol de tareas como plantilla del espacio, y aplicarla en cualquier
  proyecto.
- **Mi trabajo**: las tareas propias o de mi equipo de todos los proyectos, con
  filtros de vencimiento (todas, vencidas, hoy, esta semana).
- **Hoy** ([ADR 047](adr/047-hoy-y-contadores.md)): pantalla de entrada del
  espacio, compuesta sobre el plan personal del Planificador. «De días
  anteriores» (planificado antes de hoy y sin terminar, con «Añadir a hoy»),
  «Plan de hoy» (se reordena arrastrando), lo urgente sin planificar —vence
  hoy o vencida, con «Planificar hoy»— y «Hechas hoy», plegada. Cada fila
  tiene su propio cronómetro, casilla de «hecha» y estimación editable; el
  detalle se abre en el mismo panel lateral que el resto de vistas. Un
  resumen dice cuánto queda por hacer y cuánto se ha registrado hoy. La
  barra lateral muestra un contador junto a «Hoy» y «Mis tareas».
- **Mis tareas**: Lista, Tablero, Gantt y Tabla personales sobre todos los
  proyectos del espacio ([ADR 039](adr/039-mis-tareas-vistas-personales.md)).
  El Tablero agrupa por ventana de vencimiento, no por estado; sin arrastre.
- **Planificador** ([ADR 040](adr/040-planificador.md),
  [ADR 046](adr/046-planificador-en-tres-secciones.md)): ventana rodante de
  15 días para decidir qué día se piensa hacer cada tarea, sin tocar su
  fecha de vencimiento. Cada día se reparte en tres secciones: sin hora (se
  reordena arrastrando), con hora (tareas ancladas y citas fijas del
  Cronograma, ordenadas por minuto) y vence este día (lo que vence en la
  ventana, planificado o no). Una columna aparte para lo planificado antes
  de la ventana y todavía sin terminar, de la que solo se puede arrastrar.
  Incluye una proyección de las próximas ocurrencias de tareas recurrentes
  todavía no creadas. La estimación se edita directamente en la tarjeta. La
  carga de cada día es lo que queda de cada tarea más los bloques fijos,
  comparado con la jornada personal ([ADR 045](adr/045-jornada-personal.md)):
  un día sin jornada laboral vale 0, y la comida y los bloques cerrados
  restan de la capacidad del resto.
- **Cronograma** ([ADR 041](adr/041-cronograma.md)): calendario por horas,
  con vistas Día, Semana y Mes navegables, sobre lo ya decidido en el
  Planificador. La rejilla (24 h) se ve siempre, aunque el día esté vacío;
  al pasar el ratón por un hueco aparece una casilla discontinua con la hora
  y un «pulsa aquí para crear una tarea» — un clic crea una tarea nueva o
  planifica una ya existente sin planificar, anclada a esa hora o «para el
  día». Arrastrar un tramo lo ancla a una hora concreta, y en la vista Semana
  arrastrarlo a otra columna lo mueve también de día — con una sombra en la
  columna de destino mientras se arrastra y sin salto al soltar; arrastrar
  uno de sus bordes cambia la duración (borde inferior) o adelanta el inicio
  (borde superior), escribiendo la estimación de la tarea. Una tarea sin estimar
  ocupa media hora, con borde punteado y color apagado para distinguirla; lo
  que no cabe en el día se lista aparte, sin pasar solo al día siguiente.
  Admite citas fijas y bloqueos que no son tareas (sueltos o repetidos cada
  semana en días concretos, con fecha límite opcional); un clic sobre uno
  abre su edición (mover de día si es suelto, poner o quitar la fecha límite
  si repite) o borrarlo. Muestra el cronómetro en marcha. La vista Mes lista
  hasta tres elementos por día y un «+N» que abre la vista Día de esa fecha
  para ver el resto. El horario de la rejilla es la jornada personal de quien
  mira, y la comida —si está activa— se ve como un bloque cerrado que nadie
  puede editar.
- **Parte de horas** ([ADR 042](adr/042-parte-de-horas.md)): lo registrado
  por quien mira, cruzando proyectos, en un rango de fechas. Agrupable por
  día, tarea o proyecto; una entrada en marcha cuenta lo transcurrido hasta
  ahora. Exportable a Excel. Cada grupo se despliega en sus entradas, que se
  editan (inicio y fin) y se borran con confirmación.
- **Cronómetro** ([ADR 044](adr/044-cronometro-en-el-pie.md)): un solo
  cronómetro por persona, en el pie de la barra lateral (punto con pulso,
  título y `HH:MM:SS`; en raíl solo el punto), con una pastilla flotante
  aparte en móvil. Arrancar otro para el que estuviera en marcha; se para
  sola si la tarea entra en una columna final. Sin nada en marcha ofrece
  «Reanudar» sobre la última tarea sin terminar. Avisa una vez cuando lo
  registrado supera la estimación, y al parar una entrada de más de diez
  horas pregunta la hora real de fin. Atajo de teclado para arrancar o parar.

## 8. Paneles y objetivos

- **Paneles** personales o compartidos con el espacio, varios por persona, con
  uno por defecto creado automáticamente. Exportables a `.xlsx`, con una hoja
  por widget.
- **Widgets**: contador, desglose, tendencia, tiempo registrado, progreso de
  épica, lista de tareas, **semana en curso**, bandeja de entrada y objetivo.
  Las métricas son tareas, completadas, porcentaje completado, estimado y
  registrado; se agrupan por proyecto, asignado, prioridad, equipo, estado,
  hecho, vencimiento (sin fecha, vencida, hoy, esta semana, más adelante),
  épica, tiempo o nada —el total sin repartir—. Cada widget tiene su propio
  ámbito —todo el espacio o un proyecto, y opcionalmente solo lo asignado a
  quien mira o a sus equipos—, su propio filtro, su propia ventana de
  vencimiento, y un tamaño propio.
- **Rejilla redimensionable** de doce columnas invisibles: cada widget se
  arrastra para moverlo y se estira por la esquina para cambiarle ancho (1-12) y
  alto (1-6), o se ajusta desde su diálogo. Los widgets se recolocan sin dejar
  huecos y el ancho se reduce solo en tablet y móvil.
- **Distribución de partida** en tres alturas: ocho cifras arriba —vencidas,
  vencen hoy, vencen esta semana, pendientes, cerradas en siete días, alta
  prioridad, sin fecha y horas registradas—, la semana en curso a ancho
  completo, y debajo la lista de pendientes con la bandeja al lado. Restaurable
  en cualquier momento, sustituyendo los widgets que se hayan añadido o editado.
- **Objetivos (OKR)**: objetivo con periodo de fechas y **resultados clave**
  medidos con el mismo motor de agregación que los widgets. Compartibles con el
  espacio.

## 9. Etiquetas, búsqueda y notificaciones

- **Etiquetas** de espacio de trabajo con color, creables al vuelo desde la
  tarea.
- **Paleta de comandos** con `Ctrl/Cmd+K`: navegar a proyectos, crear tarea,
  proyecto o espacio, cambiar el tema y abrir la ayuda de atajos.
- **Búsqueda global** con `/`: tareas, proyectos, espacios, comentarios y
  actividad, más búsqueda por ID corto de tarea (`DEP-23`).
- **Notificaciones in-app** con campana, contador de no leídas, marcar todas
  como leídas y borrar todas. Eventos: tarea creada, asignación, mención,
  comentario, cambio de estado, recordatorio de vencimiento, tarea vencida,
  espacio creado y alta en un espacio de trabajo.
- **Canales de entrega externos** por usuario: **email (SMTP)**, **ntfy**,
  **Gotify** y **webhook propio firmado**, con reglas por espacio de trabajo
  —qué canales y qué proyectos, todos o una selección— y **antelación
  configurable del recordatorio de vencimiento**, de una hora a treinta días.
  Los secretos se guardan cifrados.

## 10. Importación y exportación

- **Importar CSV y Excel** con un asistente de cuatro pasos: subir el fichero,
  mapear las columnas, confirmar los tipos y ver el informe. Crea los campos
  personalizados que falten, reconstruye la jerarquía desde una columna de
  **numeración de esquema** (`1`, `1.1`, `1.1.2`), y trae épicas, etiquetas,
  equipo, asignados múltiples y estimación
  ([ADR 017](adr/017-formato-de-intercambio.md)).
- **Idempotente** vía `external_ref`: reimportar actualiza, nunca duplica.
- **Ensayo en seco** que recorre el camino real y deshace al final.
- Techo de 20.000 filas. Medido: 5.000 filas en 6,6 s de alta y 6,1 s de
  reimportación.
- **Exportar** a CSV, a Excel y a copia JSON; **cualquier vista con sus filtros
  aplicados**; y el libro completo del espacio en formato SERVITEC
  ([ADR 012](adr/012-exportacion-a-excel.md)).
- **Importar issues** existentes de GitHub y de Gitea.
- **Importador de PLANKA** (`packages/planka-import`): una CLI que lee PLANKA
  por su API y crea en Riuna por la API pública con una API key, con
  `--dry-run`. Mapea tableros, listas, tarjetas, checklists, elementos
  enlazados, etiquetas, asignados y comentarios.

## 11. Integraciones

| Integración | Dirección | Qué hace |
|---|---|---|
| **GitHub** | Bidireccional | GitHub App. Crea y actualiza issues, comentarios, título, descripción, prioridad, estado y etiquetas. Recibe diez webhooks —issues, comentarios, etiquetas, pull requests y push— con emparejado por nombre de rama. Importa issues existentes |
| **Gitea** | Bidireccional | Lo mismo, con URL base y token personal por proyecto, y secreto de webhook propio |
| **Slack** | Salida | Webhook entrante, seis eventos conmutables |
| **Discord** | Salida | Webhook, los mismos seis eventos |
| **Telegram** | Salida | Bot token y chat, los mismos seis eventos |
| **Webhook genérico** | Salida | Doce eventos, firma HMAC-SHA256 en `X-Riuna-Signature`, guarda anti-SSRF, y salud de la integración: último éxito, último fallo y contador |

- **Reglas de flujo de trabajo**: mapear *(integración, evento) → columna*. Por
  ejemplo, «cuando se abre un pull request, mueve la tarea a En revisión».
- **Enlaces externos** en la tarea: issue, rama y pull requests con su estado
  (merged, draft, open).

## 12. MCP — agentes de IA

Dos caminos con **las mismas 39 herramientas**:

- **Servidor HTTP integrado** en la API, en `/api/mcp`, con OAuth 2.1 y PKCE
  S256, registro dinámico de clientes, página de consentimiento explícito y
  sesiones aisladas por usuario.
- **Paquete stdio publicable** `@riuna/mcp` (binario `riuna-mcp`), con
  instalador interactivo para Cursor —global y por proyecto—, Claude Desktop o
  una ruta JSON propia, y autenticación por device flow o `RIUNA_API_KEY`.

Las herramientas cubren identidad y espacios, proyectos, tareas, comentarios,
etiquetas, épicas, relaciones, miembros, búsqueda, columnas, registro de
tiempo, actividad y notificaciones.

## 13. Tiempo real

- **WebSockets** por proyecto y por usuario, con lotes de 100 ms y
  deduplicación, que empujan creación, actualización, borrado y movimiento de
  tareas, además de relaciones, etiquetas, comentarios, ciclos, épicas, vistas,
  campos y notificaciones.
- **Fan-out opcional por Redis** para varias réplicas, en modo standalone,
  sentinel o cluster. Sin Redis todo funciona igual en instancia única.
- Un bus de eventos interno alimenta también la actividad, las notificaciones,
  «Mi trabajo» y las integraciones.

## 14. Interfaz

- **Español por defecto** e inglés. El catalán existe al 13% y está desactivado
  a propósito para no prometer lo que no cumple.
- Tema **claro, oscuro o el del sistema**.
- **Modo compacto**, barra lateral abierta o cerrada por defecto, primer día de
  la semana, vista por defecto, y mostrar u ocultar números de tarea,
  asignados, fechas, etiquetas y prioridad en las tarjetas.
- **Atajos de teclado** con ayuda buscable (`?`): crear (`t`+`c`, `p`+`c`,
  `w`+`c`), cambiar de vista (`v`+`b`, `v`+`l`, `v`+`k`, `v`+`c`, `v`+`g`),
  navegar (`j`/`k`), notificaciones (`n`+`o`) y barra lateral (`Ctrl/Cmd+B`).
- Navegación móvil propia para las vistas de proyecto.

## 15. Operación

- **Despliegue**: imagen única —API y web tras nginx— o imágenes separadas.
  `compose.yml` para producción, `compose.local.yml` para desarrollo con
  servicio de copias, y `compose.coolify.yml`.
- **Helm chart** con Ingress, **Gateway API (HTTPRoute)**, HPA, PVC y
  PostgreSQL opcional, publicado como OCI.
- **Copias de seguridad automáticas**: `pg_dump | gzip` con la misma imagen de
  Postgres que el servidor, retención configurable, escritura a `.partial` y
  renombrado al final. La **restauración está verificada**: comprueba el
  volcado antes de tocar nada y permite restaurar a una base de ensayo. Ver
  [copias de seguridad](copias-de-seguridad.md).
- **Cinco trabajos programados**: recordatorios de vencimiento, recordatorios
  de webhook de proyecto, reconciliación de asientos, recordatorios de prueba y
  generación de tareas recurrentes.
- **Migraciones automáticas al arranque** bajo cerrojo consultivo, con
  `startupProbe` en el chart para que Kubernetes no mate el pod a mitad.
- **OpenAPI** generado en `/api/openapi` y congelado en `apps/api/openapi.json`.
- **Sentry** configurado como código —alertas y paneles en `sentry/`—, inactivo
  mientras no haya DSN.
- **Banco de pruebas de volumen**: `db:seed:volume` siembra 50.000 tareas y se
  niega a correr contra una base cuyo nombre no acabe en `_bench` o `_test`.
- Almacenamiento **S3** para adjuntos, con URL prefirmadas y limpieza de
  huérfanos.
- 86 variables de entorno documentadas en `.env.sample`, con una guarda en CI
  que impide añadir una sin documentar.

---

## Lo que no está

Para que nadie busque lo que no existe:

- **Motor de automatizaciones de usuario** (disparador → condición → acción).
  Solo existe `workflowRule`, que mapea eventos de integración a columnas.
- **Importadores de Trello, Jira, Asana y Notion** — fase 8.
- **Importar** la hoja de SERVITEC: se exporta, no se importa.
- **Agrupar por épica** y elegir qué columnas se ven en la vista Tabla.
- **Editor de definiciones de campos personalizados**: renombrar, archivar,
  borrar y reordenar existen en la API y no en la interfaz.
- **MCP no sabe de campos personalizados**, vistas, paneles, objetivos, ciclos,
  plantillas, recurrencias, «Mi trabajo», asignados múltiples ni equipos.
- **Las vistas no paginan.** El presupuesto de 300 ms se cruza en torno a las
  6.500 tareas en un mismo proyecto.
- **Cambiar un campo personalizado no deja rastro en la actividad.**
- **Límite de tasa general de la API.** Solo lo tienen las API keys y, en modo
  cloud, el registro.
- **Copias fuera de la máquina** y guía de actualización propia — fase 9.
- **CRM y ERP** — bloque B del plan.

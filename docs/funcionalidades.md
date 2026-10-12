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
independiente. A fecha de este documento están cerradas las fases 0 a 8 del
plan, y la 9 (operación) está hecha salvo dos cosas que se lanzan en el PC. De la 8, los importadores de Trello,
Jira, Asana y Notion quedaron solo documentados, por decisión del usuario.

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
- **Límites de tasa** ([ADR 074](adr/074-limites-de-tasa.md)):
  - entrar, registrarse, invitar y recuperar la contraseña, por IP;
  - toda la API, por persona o clave (600 por minuto);
  - lo público, por IP: el calendario `.ics`, los webhooks y el proyecto público.
  - La IP solo se toma de `X-Forwarded-For` si la conexión viene de un proxy de confianza.
  - En la web, un 429 se explica en español.
- Antiabuso, solo en modo cloud: Turnstile en el registro y bloqueo de correos
  desechables.
- Perfil: nombre, correo, **avatar con recorte**, idioma, y **borrado de
  cuenta** con purga de datos.
- **Sesiones activas** en *Ajustes › Seguridad*
  ([ADR 079](adr/079-sesiones-activas.md)):
  - dónde está abierta la cuenta: navegador y sistema, IP, cuándo entró y cuándo
    caduca, y si un administrador entró como tú;
  - cerrar una sesión o todas menos esta. El dispositivo cerrado deja de
    funcionar en cinco minutos como mucho;
  - la API nunca devuelve el token de una sesión, y una clave de API no puede
    cerrarlas.

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

- **Quién puede qué por defecto**: `member` crea y edita tareas, **las asigna**
  ([ADR 062](adr/062-los-miembros-asignan-tareas.md)) y crea proyectos; definir
  campos personalizados, borrar y administrar el espacio quedan para `admin` y
  `owner`.
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
- **Avisos del proyecto y del espacio**
  ([ADR 081](adr/081-avisos-de-proyecto-y-espacio.md)):
  - un tablón con el editor de siempre, el del proyecto en el megáfono de su
    cabecera y el del espacio en la paleta de comandos;
  - publican quien puede configurar el proyecto (`project:update`) o el espacio
    (`workspace:manage_settings`);
  - al publicar se puede avisar a todos los miembros, por la campana y los
    canales; editar no vuelve a avisar;
  - uno fijado sale como franja en las vistas del proyecto, hasta una fecha o
    sin fin, y cada uno puede ocultarla en su navegador;
  - un proyecto «Personal» no tiene avisos.

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
- **Atajos en el detalle**: `j` y `k` navegan entre tareas; `Tab` y
  `Shift+Tab` sangran y promueven en el modo jerarquía. Con el detalle
  abierto, `s` estado, `p` prioridad, `a` asignado, `l` etiquetas (en
  pantallas anchas, donde se ven) y `d` vencimiento abren su selector. Solo
  a quien puede editar tareas. Mientras el detalle está abierto, `p` es la
  prioridad y no el prefijo de `p c`/`p l`.
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
| **Tablero (Kanban)** | Arrastrar entre columnas y dentro de una columna, filtros y búsqueda rápida resueltos en el servidor (el mismo motor que la Tabla), orden y añadir tarea por columna |
| **Lista** | Agrupación por estado, equipo o **jerarquía**; secciones plegables; arrastrar para reparentar; archivar todas las completadas |
| **Backlog** | Secciones *planificadas* y *archivadas*, filtros del servidor, agrupación, orden y «mover todo» al tablero |
| **Tabla** | Hoja de cálculo con edición en línea, **campos personalizados como columnas**, filtros compuestos, cuatro modos de jerarquía, **vistas guardadas**, **totales de todo el filtro** (cuántas, estimado, registrado y cada campo de número o moneda) y **colorear filas** por prioridad o vencimiento ([ADR 080](adr/080-totales-y-colores-en-la-tabla.md)) |
| **Calendario** | Rejilla mensual, barras multi-día por fecha de inicio y de vencimiento, desbordamiento por día y filtros |
| **Gantt** | Zoom día/semana/mes/trimestre, arrastrar y redimensionar barras para cambiar fechas, **capa de dependencias**, rango de rama y filtros |
| **Ciclos** | Panel de sprint con métricas y gráficas |

**Motor de filtros** común a todas ([ADR 014](adr/014-motor-de-filtros.md)):
árbol `and`/`or`/`not` con los operadores `eq`, `neq`, `gt`, `gte`, `lt`,
`lte`, `contains`, `startsWith`, `in`, `notIn`, `isEmpty` y `isNotEmpty`, sobre
campos nativos, campos personalizados y pertenencia (épica, etiqueta,
asignado, observador). El filtro vive en la URL, así que se comparte pegando el
enlace.

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
- **Personal** ([ADR 051](adr/051-la-bandeja-es-un-proyecto-oculto.md), antes
  «Bandeja»): un proyecto por persona y espacio para dejar lo que llega sin
  decidir aún a qué proyecto va. Cada uno ve el suyo fijo en lo alto de
  «Proyectos», en la barra, y se crea la primera vez que se abre; sus tareas
  llevan la clave `PER`. Funciona como cualquier proyecto —tablero, lista,
  detalle y «Mover a otro proyecto»— pero **no sale en las listas** de
  proyectos de los demás: ni en su barra, ni en los selectores, ni en la
  administración, ni en la búsqueda de proyectos, ni en `list_projects` de
  MCP. **No es privado**: sus tareas salen en Mis tareas, Hoy, la búsqueda y
  los paneles como las de cualquier otro proyecto, y la cabecera lo explica.
  Si la persona sale del espacio o se borra su cuenta, pasa a ser un proyecto
  normal, con sus tareas.
- **Captura rápida** ([ADR 052](adr/052-captura-rapida.md)): una línea se
  convierte en tarea al pulsar Intro, asignada a quien la escribe y en su
  proyecto Personal salvo que diga otro. La sintaxis es cerrada y en castellano:
  - `1h30`, `1,5h` o `30m` para la estimación;
  - `@hoy`, `@mañana`, `@vie` o `@15/10`, con hora opcional detrás
    (`@mañana 10:00`), para el día del plan, nunca para el vencimiento;
  - `!vie` o `!15/10` para el vencimiento;
  - `#etiqueta` para una etiqueta que ya existe;
  - `+CLAVE` para el proyecto;
  - `*alta` o `*urgente` para la prioridad;
  - `\` delante, para dejar una palabra tal cual.

  Lo que no se entiende se queda en el título, y unos chips debajo enseñan lo
  que se va a crear. Se abre con la tecla `q` desde cualquier pantalla o desde
  la paleta. Además hay una caja fija en Hoy, que planifica para hoy por
  defecto, en «Sin planificar» del Planificador y en el proyecto Personal.
- **Acciones de fila**
  ([ADR 053](adr/053-acciones-de-fila-imprescindibles-y-plan-en-bloque.md)):
  el mismo menú en Hoy, el Planificador, el Cronograma y Mis tareas. Sale con
  el botón «⋯» o con el clic derecho, y sirve para:
  - marcar como hecha y arrancar o parar el cronómetro;
  - planificar hoy o mañana, o elegir día en un calendario;
  - fijar la hora y quitar del plan;
  - estimar;
  - marcarla como imprescindible.
- **Imprescindibles**: hasta tres por día, y lo impone la base. Salen
  primero en Hoy, con una estrella, y dejan de serlo al cambiar de día.
- **Añadir todo a hoy**: trae de una vez lo que quedó de días anteriores.
- **Terminar el día**
  ([ADR 054](adr/054-terminar-el-dia-y-la-valoracion-privada.md)): un ritual
  en cinco pasos que se abre con un botón en la cabecera de Hoy:
  1. el resumen: lo terminado y lo registrado;
  2. una decisión obligatoria sobre cada pendiente: el siguiente día
     laborable, otro día o fuera del plan;
  3. qué te frena;
  4. tu valoración del día (impacto, energía y una nota), **que solo ves tú**;
  5. lo que tienes para el próximo día.

  El botón pasa a decir «Día cerrado» cuando ya se ha hecho. Repetirlo
  actualiza el cierre.
- **Planificar el día**: el ritual de la mañana, también con un botón en Hoy.
  Seis pasos que actúan al momento:
  1. lo de días anteriores, con «Añadir a hoy» o todo de una vez;
  2. lo urgente;
  3. lo de Personal y lo que aún no tiene día;
  4. hasta tres imprescindibles;
  5. la carga frente a la jornada, con las estimaciones editables y aviso si
     no cabe;
  6. las horas ancladas.

  «Empezar» arranca el cronómetro en la primera imprescindible.
- **Revisión semanal**: se abre con un botón en el Planificador. Seis pasos:
  1. repasar lo personal: mover cada tarea a su proyecto sin salir del
     ritual, planificarla o terminarla;
  2. lo vencido;
  3. «Esperando a»;
  4. la semana: lo terminado, lo registrado y la precisión frente a lo
     estimado, solo en lo que se estimó y se midió;
  5. la carga de cada día laborable de la siguiente semana, con lo que aún no
     tiene día;
  6. qué te frena y tu valoración, también privada.

  Revisa la semana en curso; en sus dos primeros días, la anterior, y se
  puede cambiar entre las dos. Los tres rituales están también en la paleta.
- **Avisos del navegador**
  ([ADR 055](adr/055-avisos-del-navegador-sin-service-worker.md)): se
  activan en Ajustes › Preferencias para ese navegador, y avisan a la hora
  anclada de cada tarea de hoy. Al pulsar el aviso se puede empezar,
  posponerlo diez minutos o pasar la tarea al siguiente día laborable con la
  misma hora. Solo con una pestaña de Riuna abierta, y una sola avisa: sin
  push ni service worker.
- **Modo foco** ([ADR 056](adr/056-modo-foco-sobre-entradas-reales.md)):
  desde el menú de una tarea, a pantalla completa. Hay tres modos:
  - Pomodoro: 25 minutos de trabajo y 5 de descanso, con uno de 15 cada
    cuatro;
  - Flowtime: el descanso es el 20 % de lo trabajado;
  - cuenta atrás de los minutos que se elijan.

  El trabajo se registra como entradas de tiempo normales, marcadas como
  sesión de foco, y los descansos no registran nada. Al acabar cada fase
  avisa. La fase y su reloj se ven en el pie de la barra lateral. Si el
  cronómetro se para por otro lado, la sesión termina. El cierre del día
  cuenta las sesiones.
- **Avisos de ritmo** (también en la
  [ADR 056](adr/056-modo-foco-sobre-entradas-reales.md)): bajo los avisos del
  navegador, en Ajustes › Preferencias, cada uno por separado y apagados de
  serie:
  - descanso, tras 90 minutos seguidos registrando, aunque se cambie de
    tarea;
  - sin registrar: en la jornada, tras 15 minutos sin cronómetro, como mucho
    uno por hora;
  - fuera de jornada: el cronómetro sigue en marcha pasada la hora de
    salida.
- **Enlace del calendario**
  ([ADR 057](adr/057-exportar-el-calendario-por-token.md)): en Ajustes ›
  Preferencias, un enlace `.ics` por persona y espacio para suscribirse desde
  Google Calendar, Outlook o el móvil. Lleva el plan con hora, los bloques
  del Cronograma (los repetidos, como series) y los vencimientos de lo
  asignado, como días enteros. La ventana va de un mes atrás a tres meses
  adelante. El enlace se enseña una vez, y se puede regenerar o revocar.
  Quien lo tenga ve esos títulos, y deja de valer si la persona sale del
  espacio.
- **Ausencias y festivos** ([ADR 060](adr/060-ausencias-y-festivos.md)):
  - cada persona da sus ausencias en Ajustes › Preferencias, para el
    espacio activo: un rango de días y una nota que solo ve ella, sin
    motivo;
  - los festivos del espacio se gestionan en Administración › Festivos, con
    el permiso de gestionar los ajustes del espacio, y los ven todos.

  Un día no disponible cuenta cero horas en el Planificador, el Cronograma y
  Hoy, que lo marcan con «Festivo · nombre» o «Ausente», y ese día no suena
  el aviso de «sin registrar».
- **Responsable de departamento**
  ([ADR 059](adr/059-responsable-de-departamento.md)): en el diálogo de
  miembros de un equipo, quien gestiona miembros marca a su responsable.
  Ese responsable puede leer el plan y los cierres del resto del equipo,
  nunca su valoración ni cambiar nada. Cada miembro con responsable lo ve
  avisado en Hoy y en el Planificador.
- **Mi equipo** (también en la
  [ADR 059](adr/059-responsable-de-departamento.md)): solo para quien lleva a
  alguien, en la navegación personal. Tiene una tarjeta por persona con:
  - su plan de hoy, las imprescindibles delante;
  - la carga frente a su capacidad, con ausencias y festivos;
  - lo terminado y lo registrado;
  - y su cierre público, sin valoración.

  En otra pestaña, el stand-up de cada uno, con «Copiar todo». Se relee
  cada minuto y no permite cambiar nada.
- **Stand-up**: un botón en Hoy lo enseña, derivado al momento y sin
  guardarse:
  - ayer, es decir, lo terminado el último día laborable;
  - hoy: el plan, con las imprescindibles marcadas;
  - los bloqueos del último cierre.

  Nunca incluye la valoración privada. «Copiar en Markdown» lo deja listo para
  pegarlo donde el equipo lo comparta; enviarlo solo a Slack o Telegram queda
  para la Fase 8.
- **Mi trabajo**: las tareas propias o de mi equipo de todos los proyectos, con
  filtros de vencimiento (todas, vencidas, hoy, esta semana).
- **Nueva tarea en la cabecera**: un botón en la barra superior de cada
  pantalla —espacio personal, administración y proyectos— abre el diálogo de
  crear tarea, el mismo que «t c». Fuera de un proyecto pide el proyecto y la
  tarea nace asignada a quien la crea, para que salga al momento en «Sin
  planificar» y en Mis tareas; dentro de un proyecto toma ese proyecto.
- **Hoy** ([ADR 047](adr/047-hoy-y-contadores.md)): pantalla de entrada del
  espacio, compuesta sobre el plan personal del Planificador. «De días
  anteriores» (planificado antes de hoy y sin terminar, con «Añadir a hoy»),
  «Plan de hoy» (se reordena arrastrando), lo urgente sin planificar —vence
  hoy o vencida, con «Planificar hoy»— y «Hechas hoy», plegada. Cada fila
  tiene su propio cronómetro, casilla de «hecha» y estimación editable. En
  pantallas anchas, pulsar una tarea la enseña en un resumen fijo a la
  derecha —proyecto, estado, prioridad, estimado, registrado (con lo que
  lleva el cronómetro) y vencimiento— con un botón al detalle completo; en
  pantallas estrechas se abre directamente el panel lateral. Un
  resumen dice cuánto queda por hacer y cuánto se ha registrado hoy. La
  barra lateral muestra un contador junto a «Hoy» y «Mis tareas».
- **Mis tareas**: Lista, Tablero, Gantt y Tabla personales sobre todos los
  proyectos del espacio ([ADR 039](adr/039-mis-tareas-vistas-personales.md)).
  El Tablero agrupa por ventana de vencimiento, no por estado; sin arrastre.
  La Lista y el Tablero cargan de 100 en 100, con «Mostrando N de M» y
  «Cargar más». La pestaña **«Esperando a»** reúne lo que depende de otra
  persona:
  - lo que creaste y asignaste a otra persona, y sigue abierto, con a quién
    esperas;
  - lo tuyo bloqueado por una tarea abierta que no es tuya, con cuál.

  La pestaña **«Observando»** ([ADR 076](adr/076-observadores.md)) enseña lo que
  observas, sigue abierto y no tienes asignado, lo último que se movió primero y
  con quién lo tiene.
- **Planificador** ([ADR 040](adr/040-planificador.md),
  [ADR 046](adr/046-planificador-en-tres-secciones.md)): ventana rodante de
  15 días para decidir qué día se piensa hacer cada tarea, sin tocar su
  fecha de vencimiento. Cada día se reparte en tres secciones: sin hora (se
  reordena arrastrando), con hora (tareas ancladas y citas fijas del
  Cronograma, ordenadas por minuto) y vence este día (lo que vence en la
  ventana, planificado o no). La sección con hora está siempre, aunque el
  día no tenga nada con hora: soltar ahí ancla la tarea al inicio de la
  jornada y abre el selector de hora. Las tareas ancladas se arrastran a otro
  día, conservando su hora, o a «sin hora», que la suelta. Cada tarjeta lleva
  su casilla de «hecha» y su cronómetro. Una columna aparte para lo
  planificado antes de la ventana y todavía sin terminar, de la que solo se
  puede arrastrar.
  Unas flechas mueven la ventana de semana en semana, más allá de los quince
  días, y «Hoy» la devuelve.
  Incluye una proyección de las próximas ocurrencias de tareas recurrentes
  todavía no creadas. La estimación se edita directamente en la tarjeta. La
  carga de cada día es lo que queda de cada tarea sin terminar más los bloques
  fijos, comparado con la jornada personal
  ([ADR 045](adr/045-jornada-personal.md)): un día sin jornada laboral vale 0,
  y la comida y los bloques cerrados restan de la capacidad del resto. La
  calcula la API, y el Cronograma enseña exactamente la misma
  ([ADR 050](adr/050-recordatorios-por-asignado-y-una-sola-carga.md)).
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
  ocupa media hora, con un tinte más apagado y el título atenuado; lo
  que no cabe en el día se lista aparte, sin pasar solo al día siguiente.
  Admite citas fijas y bloqueos que no son tareas (sueltos o repetidos cada
  semana en días concretos, con fecha límite opcional); un clic sobre uno
  abre su edición (mover de día si es suelto, poner o quitar la fecha límite
  si repite) o borrarlo. Muestra el cronómetro en marcha. La vista Mes lista
  hasta tres elementos por día y un «+N» que abre la vista Día de esa fecha
  para ver el resto. El horario de la rejilla es la jornada personal de quien
  mira, y la comida —si está activa— se ve como un bloque cerrado que nadie
  puede editar. Una leyenda explica los cinco tonos de la rejilla: del plan
  (teal), hora fija (navy), en marcha (ámbar), bloque cerrado (rayado) y
  recurrente proyectada (contorno discontinuo).
- **Parte de horas** ([ADR 042](adr/042-parte-de-horas.md)): lo registrado
  por quien mira, cruzando proyectos, en un rango de fechas. Agrupable por
  día, tarea o proyecto; una entrada en marcha cuenta lo transcurrido hasta
  ahora. Exportable a Excel. Cada grupo se despliega en sus entradas —con el
  título de su tarea, y la fecha si no se agrupa por día—, que se editan
  (inicio y fin) y se borran con confirmación.
- **Cronómetro** ([ADR 044](adr/044-cronometro-en-el-pie.md)): un solo
  cronómetro por persona, en el pie de la barra lateral (punto con pulso,
  título y `HH:MM:SS`; en raíl solo el punto), con una pastilla flotante
  aparte en móvil. Arrancar otro para el que estuviera en marcha; se para
  sola si la tarea entra en una columna final. Sin nada en marcha ofrece
  «Reanudar» sobre la última tarea sin terminar. Avisa una vez cuando lo
  registrado supera la estimación, y al parar una entrada de más de diez
  horas pregunta la hora real de fin. Atajo de teclado para arrancar o parar.
  **Se arranca desde cualquier tarea**: Hoy, el detalle, las tarjetas del
  Planificador, los tramos del Cronograma, la Lista de Mis tareas y el
  tablero de proyecto. En escritorio aparece al pasar el ratón por la fila; en
  marcha y en pantallas táctiles se ve siempre. Solo lo ofrece a quien puede
  editar tareas. En móvil, sin nada en marcha, la pastilla ofrece «Reanudar».
- **Tiempo en el detalle de la tarea**: el día en que la tiene quien mira en
  su plan, con un calendario para cambiarlo o quitarla del plan; lo
  registrado en la propia tarea frente a lo estimado (aunque no tenga hijas);
  cada entrada, de quien sea, con su fecha y duración; y **registro manual**
  (fecha, hora de inicio y duración en cualquier forma: `1h 30m`, `90m`,
  `1:30`).

## 8. Paneles y objetivos

- **Paneles** personales o compartidos con el espacio, varios por persona, con
  uno por defecto creado automáticamente. Exportables a `.xlsx`, con una hoja
  por widget.
- **Widgets**: contador, desglose, tendencia, tiempo registrado, progreso de
  épica, lista de tareas, **semana en curso**, notificaciones y objetivo. El de
  notificaciones se llamaba «Bandeja» hasta que ese nombre pasó al proyecto de
  captura, hoy «Personal».
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
  completo, y debajo la lista de pendientes con las notificaciones al lado. Restaurable
  en cualquier momento, sustituyendo los widgets que se hayan añadido o editado.
- **Objetivos (OKR)**: objetivo con periodo de fechas y **resultados clave**
  medidos con el mismo motor de agregación que los widgets. Compartibles con el
  espacio. Borrar un objetivo, o un widget de un panel, pide confirmación. Por
  ahora no tiene entrada en la barra lateral: se abre desde la paleta o en
  `…/goals` ([ADR 061](adr/061-la-administracion-en-el-menu-del-avatar.md)).

## 9. Etiquetas, búsqueda y notificaciones

- **Etiquetas** de espacio de trabajo con color, creables al vuelo desde la
  tarea.
- **Paleta de comandos** con `Ctrl/Cmd+K`:
  - ir a las pantallas personales (Hoy, Planificador, Cronograma, Mis tareas,
    Parte de horas, Mi panel, Objetivos, Avisos del espacio) o a cualquier proyecto del espacio
    (`p`+`l` abre la paleta en esa lista);
  - parar el cronómetro o reanudar la última tarea;
  - crear tarea, proyecto o espacio. Fuera de un proyecto, la tarea nace
    asignada a quien la crea, igual que con el botón de la cabecera;
  - cambiar el tema y abrir la ayuda de atajos.
- **Búsqueda global** con `/`: tareas, proyectos, espacios, comentarios y
  actividad, más búsqueda por ID corto de tarea (`DEP-23`).
- **Notificaciones in-app** con campana, contador de no leídas, marcar todas
  como leídas y borrar todas. Eventos: tarea creada, asignación, mención,
  comentario, cambio de estado, recordatorio de vencimiento, tarea vencida,
  espacio creado y alta en un espacio de trabajo.
- **Comentarios, cambios de estado y cambios de vencimiento llegan a todos los
  asignados y a quien observa**, nunca a quien hizo el cambio ni a quien ya no es
  del espacio ([ADR 076](adr/076-observadores.md)). A quien solo observa no se le
  dice «tu tarea». Quien sale mencionado recibe la mención y no también el
  comentario. Lo que arrastra una cascada y lo importado no avisan.
- **Canales de entrega externos** por usuario: **email (SMTP)**, **ntfy**,
  **Gotify** y **webhook propio firmado**, con reglas por espacio de trabajo
  —qué canales y qué proyectos, todos o una selección— y **antelación
  configurable del recordatorio de vencimiento**, de una hora a treinta días.
  Los secretos se guardan cifrados.
- **El recordatorio de vencimiento y el de «vencida» llegan a cada asignado**,
  no solo al responsable principal, cada uno con su antelación. No avisan de
  lo terminado ni de lo archivado, y se vuelven a armar en cuanto cambia el
  vencimiento, se cambie desde donde se cambie
  ([ADR 050](adr/050-recordatorios-por-asignado-y-una-sola-carga.md)).

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
  ([ADR 012](adr/012-exportacion-a-excel.md)), con los comentarios seguidos y la
  fecha de cada uno en negrita.
- **La hoja de SERVITEC de vuelta** ([ADR 069](adr/069-la-hoja-de-servitec-vuelve.md)),
  desde *Administración del espacio › General*:
  - sirve para migrar el cuadro que se llevaba a mano y para la ida y vuelta,
    exportar, editar en Excel y volver a subir;
  - una fila exportada actualiza su tarea por el ID que lleva en una columna oculta;
  - sin él, subir dos veces la misma hoja no duplica nada;
  - el asistente resuelve cada PROYECTO que no existe: crearlo, llevar sus filas a
    otro o descartarlas;
  - los estados vuelven a columnas y los comentarios entran con su día y sin
    repetirse;
  - tiene ensayo en seco;
  - la hoja no mueve tareas de proyecto.
- **Importar issues** existentes de GitHub y de Gitea.
- **Importador de PLANKA** (`packages/planka-import`): una CLI que lee PLANKA
  por su API y crea en Riuna por la API pública con una API key, con
  `--dry-run`. Mapea tableros, listas, tarjetas, checklists, elementos
  enlazados, etiquetas, asignados y comentarios.
- Los importadores de **Trello, Jira, Asana y Notion** están documentados, no
  construidos: la receta y lo que falta están en la
  [ADR 070](adr/070-como-se-anade-un-importador-externo.md).

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

### Automatizaciones

Reglas de la forma **«Cuando · Si · Entonces»**
([ADR 066](adr/066-automatizaciones-modelo-y-alcance.md),
[067](adr/067-como-corre-una-automatizacion.md)), en *Ajustes del proyecto ›
Automatizaciones* y en *Administración del espacio › Automatizaciones*.

- **De proyecto o de espacio.** Las de espacio actúan en todos los proyectos menos
  los «Personal», y no nombran columnas: dicen «a una columna final» y «marcar
  hecha».
- **Cuando:**
  - se crea una tarea;
  - cambia de columna (de una a otra, o a una final);
  - se asigna a alguien o a un departamento;
  - cambia la prioridad o un campo personalizado;
  - alguien comenta;
  - se le pone una etiqueta;
  - **vence en N días**, o **está vencida**;
  - **se pulsa el botón**: la regla sale como acción de un clic en la tarea
    ([ADR 078](adr/078-acciones-de-un-clic.md)).
- **Si:** los mismos filtros que las vistas, campos personalizados incluidos.
- **Entonces**, en orden; si una falla, las siguientes no se hacen:
  - mover a una columna;
  - marcar hecha;
  - prioridad;
  - vencimiento relativo;
  - un campo personalizado;
  - una etiqueta;
  - asignar personas o un departamento;
  - crear una tarea o subtarea;
  - **avisar** a asignados, a quien la creó, a quien la observa, al departamento
    o a su responsable;
  - **webhook firmado**;
  - **mensaje a Slack, Discord o Telegram**.

  Los textos admiten `{tarea}`, `{titulo}`, `{estado}`, `{proyecto}` y `{enlace}`.
- **Encadenan con las reglas de GitHub y Gitea**: los movimientos que estas provocan
  disparan aquellas.
- **Actúa en nombre de quien la guardó por última vez.**
  - Si esa persona pierde el permiso, la regla se pausa sola y lo dice.
  - En la actividad aparece como «Automatización ‹nombre›».
- **No disparan** con lo importado ni con lo que arrastra una cascada, y cortan los
  bucles entre reglas.
- **Historial** de cada ejecución: lo que hizo, la acción que falló y por qué no corrió.
- **Cinco recetas** listas para usar.
- **Permisos:**
  - de proyecto, `project:update`; si sacan datos fuera, también
    `workspace:manage_settings`;
  - de espacio, `workspace:manage_settings`.

  Los secretos (el del webhook, el del bot, la URL de Slack o Discord) se guardan
  cifrados y no vuelven nunca.
- **El stand-up de un departamento, a un chat, a una hora fija**
  ([ADR 068](adr/068-el-stand-up-sale-de-riuna.md)).
  - Lo programa el responsable desde «Mi equipo», o un admin.
  - Sale una vez al día. En festivo no sale, quien está ausente no aparece y nunca
    lleva la valoración.

## 12. MCP — agentes de IA

Dos caminos con **las mismas 56 herramientas**. Una prueba de paridad
(`tests/api/mcp-parity.test.ts`) falla en cuanto uno gana una que el otro no;
antes el paquete stdio se había quedado sin las cinco del plan personal y el
cronómetro.

- **Servidor HTTP integrado** en la API, en `/api/mcp`, con OAuth 2.1 y PKCE
  S256, registro dinámico de clientes, página de consentimiento explícito y
  sesiones aisladas por usuario.
- **Paquete stdio publicable** `@riuna/mcp` (binario `riuna-mcp`), con
  instalador interactivo para Cursor —global y por proyecto—, Claude Desktop o
  una ruta JSON propia, y autenticación por device flow o `RIUNA_API_KEY`.

Las herramientas cubren identidad y espacios, proyectos, tareas, comentarios,
etiquetas, épicas, relaciones, miembros, búsqueda, columnas, registro de
tiempo, actividad y notificaciones, además del plan personal, el cronómetro,
Hoy (`get_today`) y la captura a Personal (`capture_task`). `list_projects`
no lista los proyectos Personal.

## 13. Tiempo real

- **WebSockets** por proyecto y por usuario, con lotes de 100 ms y
  deduplicación, que empujan creación, actualización, borrado y movimiento de
  tareas, además de relaciones, etiquetas, comentarios, ciclos, épicas, vistas,
  campos, notificaciones y avisos (estos, a todo el espacio por el canal de
  usuario).
- **El canal de usuario no depende de la barra lateral**
  ([ADR 048](adr/048-frescura-de-las-pantallas-personales.md)): sigue conectado
  al cambiar de pantalla, en los ajustes de cuenta y en móvil con la barra
  cerrada, donde la campana va en la cabecera. Una tarea que te asignan aparece
  sola en Hoy, en «Sin planificar» y en Mis tareas, y las pantallas personales
  se releen al volver a ellas en vez de enseñar lo de antes.
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
  navegar (`j`/`k`), notificaciones (`n`+`o`), cambiar de espacio (`w`+`s`),
  cronómetro (`Ctrl/Cmd+E`), barra lateral (`Ctrl/Cmd+B`) y los del detalle
  de la tarea (`s`, `p`, `a`, `l`, `d`). La ayuda los lista todos.
- **En pantallas táctiles**, lo que en escritorio aparece al pasar el ratón
  —el cronómetro de una fila, «Añadir a hoy», crear en la vista Mes— se ve
  siempre, y en el Cronograma un toque sobre un hueco abre la casilla de
  crear tarea a esa hora.
- **Barra lateral en dos grupos**: el espacio personal —sin «Objetivos» por
  ahora— y los proyectos, con «Personal» fijo arriba. La administración del espacio —Proyectos, Miembros y
  equipos, Espacio y Ajustes de proyecto— está en el menú del avatar, debajo
  de «Ajustes», y solo sale lo que el papel de cada uno permite
  ([ADR 061](adr/061-la-administracion-en-el-menu-del-avatar.md)).
- Navegación móvil propia para las vistas de proyecto.
- **Para leer desde el móvil (390 px)**:
  - Hoy, Mis tareas, el Planificador, Mi panel, el detalle de tarea, el Tablero y la Lista se
    leen enteros;
  - los títulos tienen dos líneas, y el del detalle crece con el texto;
  - el Tablero y el Planificador van columna a columna, encajando al deslizar;
  - las cabeceras pasan a dos líneas en vez de desbordarse.
  - Una prueba recorre 26 pantallas a ese ancho y falla si alguna se sale.

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
- **Copia fuera de la máquina**: el servicio `offsite` sube las copias a Google Drive, cifradas
  con rclone. Nunca sincroniza borrando, y no purga si las copias locales han dejado de llegar
  ([ADR 072](adr/072-copias-fuera-de-la-maquina-y-simulacro.md)).
- **Simulacro de restauración** (`deploy/simulacro.sh`), en el PC con la copia real y cada
  noche en CI con datos sembrados.
  - Restaura en un proyecto Compose aislado y compara los recuentos.
  - Pasa el humo entero contra lo restaurado.
  - Arranca sin red (la API solo alcanza `localhost`), sin planificador, sin correo y con una
    clave de cifrado nueva, así que nada de lo restaurado puede salir.
- **Actualizar con red** ([ADR 071](adr/071-la-instancia-del-pc-por-tailscale.md)):
  `deploy/actualizar.sh` construye, copia, migra con la imagen nueva antes de cambiar la que
  sirve (`node dist/migrate.js`), levanta y, si algo falla, dice cómo volver. La instancia del
  PC solo escucha en localhost y se publica con `tailscale serve`.
- **Siete trabajos programados**: recordatorios de vencimiento, recordatorios
  de webhook de proyecto, reconciliación de asientos, recordatorios de prueba,
  generación de tareas recurrentes, automatizaciones (por fecha, el stand-up
  programado y la purga de su historial a los 30 días) y la salud de la instancia.
  Cada vuelta deja su resultado en `job_status`.
- **Estado de la instancia** ([ADR 075](adr/075-estado-de-la-instancia-y-alertas.md)), para
  el admin de instancia, en el menú del avatar. Enseña:
  - versión y commit;
  - la base y sus migraciones;
  - los trabajos programados;
  - las copias local y externa;
  - el tiempo real;
  - las rutas más lentas (p50 y p95);
  - la IP con la que la API ve a quien pregunta.
- **Alertas al admin de instancia** en la campana y por los canales de sus preferencias
  generales (ntfy, Gotify, correo, webhook), sin regla de espacio, cuando:
  - la copia local se retrasa, o la API no puede leer el directorio de copias;
  - la copia externa deja de subir;
  - un trabajo programado falla tres veces seguidas.
  Cada alerta avisa una vez y avisa de nuevo al resolverse. En la página y en la campana sale
  traducida; por los canales, en español.
- **Logs estructurados** ([ADR 073](adr/073-logs-estructurados.md)):
  - JSON por línea, con una por petición y un `requestId` que también sale en `X-Request-Id`;
  - los secretos, tapados;
  - todo 500, con su pila.
- **«Hoy» es el día de Madrid** ([ADR 049](adr/049-la-api-vive-en-madrid.md)):
  la API corre en `Europe/Madrid` (fijado en su imagen) y PostgreSQL en UTC.
  Un vencimiento elegido en el calendario vence ese día, no el anterior.
  Todo el mundo comparte la misma zona: no hay zona por persona.
- **Migraciones automáticas al arranque** bajo cerrojo consultivo, con
  `startupProbe` en el chart para que Kubernetes no mate el pod a mitad.
- **OpenAPI** generado en `/api/openapi` y congelado en `apps/api/openapi.json`.
- **Sentry** configurado como código —alertas y paneles en `sentry/`—, inactivo
  mientras no haya DSN.
- **Banco de pruebas de volumen**: `db:seed:volume` siembra 50.000 tareas y se
  niega a correr contra una base cuyo nombre no acabe en `_bench` o `_test`.
- Almacenamiento **S3** para adjuntos, con URL prefirmadas y limpieza de
  huérfanos.
- Todas las variables de entorno que lee la API, documentadas en `.env.sample`, con una guarda
  en CI que impide añadir una sin documentar.

---

## Lo que no está

Para que nadie busque lo que no existe:

- ~~**Motor de automatizaciones de usuario**.~~ Ya existe. Lo que le falta:
  - reintentos de webhook: un fallo queda en el historial;
  - un tope de ejecuciones por minuto;
  - herramientas MCP;
  - que la lista de reglas se refresque sola sin volver a cargar.
- **Importadores de Trello, Jira, Asana y Notion**: solo documentados
  ([ADR 070](adr/070-como-se-anade-un-importador-externo.md)). Les falta, sobre todo,
  guardar adjuntos sin S3.
- ~~**Importar** la hoja de SERVITEC.~~ Ya se puede, de ida y vuelta.
- ~~**Agrupar por épica** y elegir qué columnas se ven en la vista Tabla.~~ Ya se puede, y la vista guardada lo recuerda.
- ~~**Editor de definiciones de campos personalizados**: renombrar, archivar,
  borrar y reordenar existen en la API y no en la interfaz.~~ Ya existe, en los
  ajustes del proyecto y en los del espacio.
- **MCP no sabe de vistas, paneles, objetivos, ciclos, plantillas, recurrencias
  ni «Mi trabajo»**. Crear y editar tareas sí admite campos personalizados,
  varios asignados y equipo.
- **Las vistas no paginan.** El presupuesto de 300 ms se cruza en torno a las
  6.500 tareas en un mismo proyecto.
- ~~**Cambiar un campo personalizado no deja rastro en la actividad.**~~ Ya lo deja (con el valor anterior y el nuevo).
- **CRM y ERP** — bloque B del plan.

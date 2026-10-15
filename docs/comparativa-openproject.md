# Riuna frente a OpenProject

> Comparativa de funcionalidades para decidir qué añadir a Riuna. Se hizo el
> 2026-10-12 contra **OpenProject 17.9.1** (septiembre de 2026). Lo que se decidió
> añadir está en el [interludio de ideas de OpenProject](plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado)
> del plan, y su aspecto en la [maqueta](design-previews/ideas-openproject.html).
>
> Complementarios: [qué hace Riuna hoy](funcionalidades.md) ·
> [plan de desarrollo](plan.md) · [decisiones (ADR)](adr/)

---

## Licencia y método

OpenProject se publica con licencia **GPL-3.0**. Riuna lo usa **solo como
inspiración funcional**: ni código, ni textos, ni iconos, ni esquemas de base de
datos. Esta comparativa sale de su guía de usuario y de sus notas de versión
públicas, de la 15.0 a la 17.9, y **no se ha leído su código fuente**. Cada
funcionalidad que se toma de aquí se diseña desde cero sobre los motores de Riuna,
con su ADR.

El lado de Riuna se comprobó contra [`funcionalidades.md`](funcionalidades.md) y
contra el esquema (`apps/api/src/database/schema.ts`), no solo de memoria.

Leyenda: ✔ tiene · ◐ parcial · ✘ no tiene · **(EE)** solo en la edición
Enterprise de OpenProject.

---

## 1. Tareas

| Funcionalidad | Riuna | OpenProject |
|---|---|---|
| Árbol de subtareas multinivel, agregados de la rama | ✔ path materializado, cascadas | ✔ |
| Tarea resumen: el padre toma sus fechas de las hijas y no tiene propias | ◐ agregados al leer y corchete en el Gantt; el padre conserva sus fechas, editables | ✔ modo automático |
| Progreso ponderado por el trabajo estimado | ✘ cuenta tareas hechas | ✔ por trabajo o por estado |
| Asignados múltiples, asignar a un equipo | ✔ | ✘ un asignado y un «accountable» |
| Responsable distinto del asignado | ◐ responsable principal | ✔ |
| Observadores | ✘ | ✔ |
| Tipos de tarea, con formulario y flujo de estados por tipo y rol | ✘ se emula con un campo select | ✔ |
| Relaciones «bloquea» y «relacionada» | ✔ | ✔ |
| Precede/sigue con desfase, también negativo; «duplica»; descripción de la relación | ✘ | ✔ |
| Épicas transversales | ✔ | ◐ tipos Epic y User story |
| Campos personalizados | ✔ diez tipos | ✔ y además jerárquico (EE), lista ponderada y calculado (EE) |
| Textos de ayuda por campo | ✘ | ✔ |
| Título autogenerado por patrón | ✘ | ✔ (EE) |
| Recordatorio personal en la tarea | ◐ plan del día y aviso del navegador a la hora anclada | ✔ |
| Comentarios, editar y borrar los propios, @menciones | ✔ | ✔ |
| Reacciones con emoji, citar un comentario | ✘ | ✔ |
| Comentarios internos, visibles solo para algunos roles | ✘ | ✔ (EE) |
| Actividad por tarea | ✔ | ✔ con filtros y carga progresiva |
| Compartir una tarea concreta con alguien de fuera | ✘ solo el proyecto público | ✔ (EE) |
| Botón de un clic que cambia varios campos, con condiciones | ✘ las automatizaciones van por evento | ✔ acciones personalizadas (EE) |
| Operaciones masivas, menú contextual, mover de proyecto | ✔ | ✔ |
| Borrar con o sin descendientes | ◐ cascada configurable por proyecto | ✔ se elige al borrar |
| Copiar el enlace o el nombre de rama Git | ✔ | ◐ |
| Editor rico: tablas, código, Mermaid, embeds | ✔ | ✔ |

## 2. Planificación y vistas

| Funcionalidad | Riuna | OpenProject |
|---|---|---|
| Tablero, Lista, Backlog, Tabla y Calendario | ✔ | ✔ |
| Gantt con zoom, arrastre y capa de dependencias | ✔ | ✔ |
| Planificación automática: las sucesoras siguen a la predecesora en días laborables | ✘ | ✔ |
| Hitos | ✘ | ✔ |
| Mover la rama entera arrastrando el padre | ✘ | ✔ |
| Aviso cuando las hijas desbordan las fechas del padre | ◐ corchete neutro | ✔ corchete rojo |
| Días no laborables | ✔ festivos del espacio y ausencias personales | ✔ globales |
| Línea base: comparar la vista con ayer, la semana pasada o una fecha | ✘ | ✔ «ayer» gratis, el resto (EE) |
| Planificador de equipo: personas × días, arrastrar para reasignar | ◐ «Mi equipo», solo lectura | ✔ (EE) |
| Gestión de recursos: carga en el tiempo, disponibilidad, staffing | ◐ capacidad por persona en el Planificador y Mi equipo | ✔ (EE, 17.7) |
| Filtros and/or/not y vistas guardadas compartibles | ✔ | ✔ |
| Fila de totales en la tabla | ✘ | ✔ |
| Colorear filas por estado, prioridad o fechas | ✘ | ✔ |
| Suscripción iCal | ✔ plan, bloques y vencimientos | ✔ tareas y reuniones |

## 3. Ágil

| Funcionalidad | Riuna | OpenProject |
|---|---|---|
| Ciclos con objetivo, cierre guiado, burndown y velocidad | ✔ | ✔ desde la 17.3 |
| Varios ciclos activos a la vez | ✘ uno por proyecto, a propósito | ✔ (EE) |
| Story points | ✘ se estima en horas | ✔ |
| Cubetas dentro del backlog | ✘ | ✔ |
| Versiones y roadmap de releases | ✘ | ✔ |

## 4. Tiempo y costes

| Funcionalidad | Riuna | OpenProject |
|---|---|---|
| Cronómetro, registro manual con inicio y fin | ✔ | ✔ |
| Parte de horas agrupable y exportable a Excel | ✔ | ✔ y calendario semanal |
| Tipo de actividad y marca de facturable en cada entrada | ✘ | ✔ |
| Tarifas por hora y coste laboral | ✘ | ✔ |
| Tipos de coste y costes unitarios | ✘ | ✔ |
| Presupuesto planificado frente a real | ✘ | ✔ |
| Informes de costes | ◐ paneles con la métrica «registrado» | ✔ |
| Bloquear entradas antiguas, topes por entrada y por día | ✘ | ✔ (17.8) |
| Parte de horas en PDF con totales | ✘ solo Excel | ✔ |
| Modo foco, avisos de ritmo, jornada personal | ✔ | ✘ |

## 5. Proyectos y cartera

| Funcionalidad | Riuna | OpenProject |
|---|---|---|
| Plantillas de proyecto y de árbol de tareas | ✔ | ✔ |
| Proyecto público de solo lectura | ✔ | ✔ |
| Subproyectos, programas y carteras | ✘ | ✔ programas y carteras (EE) |
| Campos personalizados en el proyecto | ✘ | ✔ |
| Estado de salud del proyecto | ✘ | ✔ |
| Página de resumen del proyecto con widgets | ✘ | ✔ |
| Lista de proyectos como cartera: filtros, columnas, exportación | ◐ lista con progreso | ✔ |
| Fases con puertas (PM², PMflex) y solicitud de inicio de proyecto | ✘ | ✔ |

## 6. Colaboración y módulos

| Funcionalidad | Riuna | OpenProject |
|---|---|---|
| Reuniones: orden del día, acuerdos que crean tareas, recurrentes, acta | ✘ solo el stand-up derivado | ✔ |
| Wiki y documentos | ✘ | ✔ edición simultánea desde la 17.0 |
| Noticias o avisos del proyecto | ✘ | ✔ |
| Foros | ✘ | ✔ |
| Crear tareas y comentar por correo | ✘ | ✔ |
| Nextcloud, OneDrive, SharePoint | ✘ adjuntos a S3 | ✔ |
| GitHub, Gitea, GitLab | ✔ GitHub y Gitea | ✔ GitHub y GitLab |
| Slack, Discord, Telegram, ntfy, Gotify, webhook firmado | ✔ | ◐ webhooks |
| Automatizaciones «Cuando · Si · Entonces» | ✔ para todos | ◐ acciones personalizadas (EE) |
| Servidor MCP | ✔ 46 herramientas, HTTP y stdio | ✔ (EE, 17.2-17.9) |
| Importadores | ✔ CSV/Excel, PLANKA, GitHub, Gitea, hoja de SERVITEC | ✔ CSV, Jira |

## 7. Notificaciones

| Funcionalidad | Riuna | OpenProject |
|---|---|---|
| Campana en tiempo real, menciones, vencimientos a cada asignado | ✔ | ✔ |
| Aviso de la fecha de inicio | ✘ | ✔ |
| Resumen diario por correo | ✘ | ✔ |
| Motivo de cada notificación y filtros en la bandeja | ◐ | ✔ |

## 8. Seguridad, cuentas y administración

| Funcionalidad | Riuna | OpenProject |
|---|---|---|
| SSO, enlace mágico, código por correo, cuentas locales | ✔ | ✔ y SAML y LDAP (EE) |
| Segundo factor (2FA) | ✘ | ✔ |
| Ver y cerrar las sesiones activas | ✘ | ✔ |
| Antivirus en los adjuntos | ✘ | ✔ |
| Grupos anidados, LDAP/SCIM, atributos laborales, usuarios de reserva | ✘ | ✔ |
| Límites de tasa, logs, estado de la instancia, copias verificadas | ✔ | ◐ |
| Alto contraste, desactivar los atajos | ✘ | ✔ |
| Exportación a PDF | ✘ | ✔ |

## 9. Donde Riuna va por delante

La productividad personal entera: Hoy, Planificador, Cronograma, captura rápida,
imprescindibles, los rituales de planificar y cerrar el día y la revisión semanal
con valoración privada, el modo foco y los avisos de ritmo. También «Esperando a»,
el responsable de departamento con el stand-up a un chat, los OKR, las
automatizaciones para todos, los varios asignados y equipos, los canales ntfy,
Gotify y Telegram, el MCP con paridad probada, la importación idempotente con
ensayo en seco y la operación: copias fuera de la máquina, simulacro y alertas.

Nada de lo que se añada debe hacer más pesado ese flujo diario.

---

## Qué se decidió (2026-10-12)

Se preguntó funcionalidad por funcionalidad.

**Entra**, en el [interludio de ideas de OpenProject](plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado),
antes del Bloque B:

- observadores, recordatorio en la tarea, acciones de un clic, sesiones activas,
  totales y colores en la Tabla, y avisos del proyecto;
- hitos, tareas resumen (fechas automáticas del padre, mover la rama entera, aviso
  de desviación y progreso ponderado), precede/sigue con planificación automática,
  y línea base;
- estado de salud del proyecto, campos de proyecto con la lista como cartera, y
  subproyectos;
- campos calculados con textos de ayuda, y exportar a PDF;
- una wiki de páginas, sin edición simultánea.

**Se anota para el Bloque B** (CRM y ERP ligero): tipo de actividad y facturable en
las horas, tarifas por hora, presupuesto de proyecto y cierre de periodos de
imputación.

**Se consideró y no entra:** reacciones y citar comentarios, planificador de equipo,
página de resumen del proyecto, reuniones, correo entrante, 2FA, resumen diario por
correo, compartir una tarea con alguien de fuera y parte semanal en rejilla.

**Se descartó sin preguntar**, salvo que alguien lo pida:

| Qué | Por qué |
|---|---|
| Tipos de tarea con flujos de estados por rol | Choca con la simplicidad; un campo select y las automatizaciones lo cubren |
| Versiones y roadmap, story points, varios ciclos activos, cubetas del backlog | Pensados para equipos de software; Riuna tiene épicas y ciclos |
| Fases con puertas (PM², PMflex) y solicitud de inicio de proyecto | Gestión de cartera formal que un equipo pequeño no necesita |
| Foros | El chat interno está fuera de alcance |
| BIM, usuarios de reserva, títulos autogenerados, campo jerárquico | Casos de nicho |
| Antivirus de adjuntos, alto contraste | Ahora no; se pueden reconsiderar |
| Nextcloud, OneDrive, SharePoint, GitLab, LDAP, SCIM | No se usan en la instancia |
| Comentarios internos | Sin clientes dentro de Riuna no hay a quién ocultarlos; vuelve a tener sentido con el CRM |

---

## Fuentes

Documentación pública de OpenProject consultada el 2026-10-12:

- [Repositorio](https://github.com/opf/openproject) (solo la descripción, no el código)
- [Guía de usuario](https://www.openproject.org/docs/user-guide/) ·
  [funcionalidades](https://www.openproject.org/collaboration-software-features/)
- [Paquetes de trabajo](https://www.openproject.org/docs/user-guide/work-packages/) ·
  [editar un paquete](https://www.openproject.org/docs/user-guide/work-packages/edit-work-package/) ·
  [línea base](https://www.openproject.org/docs/user-guide/work-packages/baseline-comparison/)
- [Planificación en el Gantt](https://www.openproject.org/docs/user-guide/gantt-chart/scheduling/) ·
  [planificador de equipo](https://www.openproject.org/docs/user-guide/team-planner/) ·
  [roadmap](https://www.openproject.org/docs/user-guide/roadmap/)
- [Reuniones](https://www.openproject.org/docs/user-guide/meetings/) ·
  [tiempo y costes](https://www.openproject.org/docs/user-guide/time-and-costs/)
- [Acciones personalizadas](https://www.openproject.org/docs/system-admin-guide/manage-work-packages/custom-actions/) ·
  [tipos de paquete](https://www.openproject.org/docs/system-admin-guide/manage-work-packages/work-package-types/)
- [Notas de versión](https://www.openproject.org/docs/release-notes/): 15.0, 15.1,
  15.3, 15.5, 16.0 a 16.6, y 17.0 a 17.9

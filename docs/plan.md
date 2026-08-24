# Riuna — Plan de desarrollo

> Documento vivo. Se actualiza al cerrar cada fase; el estado de la tabla de
> abajo manda sobre cualquier otra cosa escrita aquí.
>
> Complementarios: [auditoría de partida](auditoria-fase-0.md) ·
> [decisiones (ADR)](adr/) · [copias de seguridad](copias-de-seguridad.md)

## Estado

| Fase | Semanas | Estado |
|---|---|---|
| 0 — Fork, marca y auditoría | 2 | **Cerrada** con pendientes menores (ver abajo) |
| 1 — Uso real y asignación por equipos | 2 | **Casi cerrada** — falta filtrar por equipo |
| 2 — Árbol de tareas y épicas | 4 | Pendiente |
| 3 — Campos personalizados | 4 | Pendiente |
| 4 — Motor de vistas y vista Tabla | 4 | Pendiente |
| 5 — Importación y exportación | 2 | Pendiente |
| **Subtotal: Riuna diferencial** | **18** | |
| 6 — Ejecución y productividad personal | 3 | Pendiente |
| 7 — Dashboards, informes y objetivos | 3 | Pendiente |
| 8 — Automatizaciones e importadores externos | 3 | Pendiente |
| 9 — Operación | 2 | Pendiente |
| **Total Bloque A** | **29** | |

**Estimación honesta:** 29 semanas nominales a ~8 h/semana son **8-11 meses**
reales para cerrar el Bloque A. La ventaja del fork no está en la fecha final,
sino en cuándo llega el valor: Riuna fue usable en la **semana 2** y la
plataforma diferencial —árbol, campos personalizados, vistas e importación—
llega en la **semana 18**. Escribiéndolo desde cero, en la semana 18 habría un
gestor de tareas básico y nada propio.

### Deuda abierta de las fases cerradas

**Fase 0** — nada de esto es visible para quien usa Riuna:
- Renombrado interno: ~1.400 referencias a "kaneo" (486 clases y atributos CSS,
  143 variables `KANEO_*`, 138 nombres de paquete `@kaneo/*`).
- ~~Logos y favicon siguen siendo los de Kaneo.~~ Cerrado: sistema de marca
  aplicado, ver [`marca.md`](marca.md) y [ADR 005](adr/005-sistema-de-marca.md).
- Artefactos de despliegue aún se llaman `kaneo` / `web` / `api` y
  `charts/kaneo`: **no ejecutar `docker.yml` ni `helm-chart.yml`** hasta
  renombrarlos.
- `package.json` sigue en la versión `2.22.0` heredada; falta decidir si se
  mantiene la trazabilidad con Kaneo o se reinicia en `0.1.0`.
- Código de facturación heredado: apagado por configuración, no eliminado.
- Catalán: 207 de 1.725 claves traducidas de verdad (12%); el resto es relleno
  en español. Lo gordo está en `settings`, `tasks` y `auth`.
- `tests/api/mcp-internal-api-url.test.ts` falla en la ejecución completa y
  pasa en aislamiento: un `fetch` global que otro test no limpia.

**Fase 1**:
- **Filtrado y agrupación por equipo en las vistas** — lo único que impide
  darla por cerrada.
- Tests de integración de los controladores nuevos.
- Las tarjetas de tablero y lista muestran solo al responsable principal; la
  lista completa de asignados solo se ve en el detalle.

---

## Contexto

**Riuna** es una plataforma de productividad all-in-one **self-hosted**:
gestión de tareas y proyectos primero, CRM y ERP ligero después.

**Estrategia: fork duro de Kaneo** (MIT, v2.22.0) convertido en **programa
independiente**, sin sincronización con upstream. No se escribe desde cero: se
parte de una aplicación que ya funciona y el esfuerzo se concentra en lo que
Kaneo no tiene.

**Requisitos:**
- **Prioridad:** núcleo de tareas/proyectos y productividad primero; CRM/ERP después.
- **Escala:** decenas de personas, varios departamentos. **Sin permisos finos: todo el mundo ve todas las tareas.** Los departamentos sirven para *asignar tareas a un grupo de usuarios*, no para aislar información.
- **Jerarquía de tareas:** requisito destacado. Árbol padre→hijo a varios niveles **con agregados y cascada**, más **épicas** transversales dentro del proyecto.
- **Datos:** se empieza limpio, pero importar y exportar **CSV/Excel** es funcionalidad de producto, e importadores desde Trello/Jira/Asana/Notion entran en el plan.
- **Móvil:** consulta puntual (lectura y captura rápida).
- **Licencia:** se mantiene la vía permisiva por si algún día se quiere vender Riuna o instalarlo en clientes.
- **Ejecución:** una persona, ~8 h/semana, con Claude Code.

**Obligación legal, que es toda la que hay:** MIT permite modificar,
relicenciar los cambios, cerrar el código y vender Riuna. Lo único obligatorio
es **conservar el aviso de copyright y el texto de la licencia de Kaneo**, en
`LICENSE` y `NOTICE`.

**Referencia adicional:** **Dolibarr** (GPL-3+) para el modelo funcional de
CRM/ERP del Bloque B — *conceptual únicamente, no se copia código ni SQL*,
porque su licencia contaminaría el proyecto.

---

## Consecuencia del fork: qué reglas cambian

Al aceptar una base existente se adoptan sus decisiones. Varias
simplificaciones planteadas para un proyecto desde cero **dejan de aplicar**, y
forzarlas sería trabajo puro sin ganancia:

| Decisión previa | Qué pasa ahora |
|---|---|
| Árbol de contenedores `container` | **Descartada.** Se acepta `workspace → project → column → task`. Su argumento fuerte eran los permisos heredados, que no hacen falta |
| Tipado con Hono RPC | **Innecesaria.** Kaneo ya trae un cliente Hono tipado en `packages/libs`, consumido desde `fetchers/` + TanStack Query |
| Sin Redis | **Descartada.** Su despliegue ya lo contempla; no se pelea con la infraestructura que funciona |
| `workspace_id` en todas las tablas | Solo en las tablas **nuevas** que cree Riuna |
| Español sin capa de i18n | **Descartada.** Kaneo ya trae i18next: español por defecto y traducir lo que falte |

**La regla nº 1 pasa a ser: seguir las convenciones de Kaneo, no imponer
otras.** Un fork con dos estilos conviviendo envejece peor que uno con un
estilo imperfecto pero consistente. Está recogido en
[`AGENTS.md`](../AGENTS.md).

**Lo que sí se mantiene**, porque es aditivo y sigue siendo correcto:
- Campos de tipo relación **fuera del JSONB** (Kaneo ya tiene `taskRelation`).
- Tabla `external_ref` para que **toda importación sea idempotente**.
- Borrado suave en las tablas nuevas (`deleted_at`), alineado con su `archivedAt`.
- **Presupuesto de complejidad** en `CLAUDE.md`.
- **Presupuesto de rendimiento:** toda vista nueva pagina y responde en < 300 ms p95 con 50.000 tareas, revisado con `EXPLAIN`.

---

## Inventario: qué se hereda ya hecho

Trabajo que Riuna **no** tiene que hacer:

**Backend** (Hono + Better Auth + Drizzle + PostgreSQL + Redis): workspaces,
`team` + `teamMember`, invitaciones y roles; proyectos, columnas y tareas con
numeración por proyecto, prioridad, fechas y orden; relaciones `subtask` /
`blocks` / `related`; etiquetas, comentarios, actividad y **registro de
tiempo**; adjuntos; notificaciones por email/ntfy/Gotify/webhook con
preferencias por usuario y workspace; búsqueda; integraciones GitHub, Gitea,
Discord, Slack, Telegram y webhooks genéricos; servidor MCP, claves de API,
OAuth y device flow; WebSockets en tiempo real; importación y exportación de
tareas; migraciones y arranque orquestado.

**Frontend** (React 19 + Vite + TanStack Router/Query + Tailwind + Radix):
vistas **Tablero**, **Kanban**, **Lista**, **Backlog**, **Calendario** y
**Gantt** —todas escritas a mano, sin librerías de terceros—, selección
múltiple, paleta de comandos ⌘K, búsqueda, editor TipTap, ajustes, onboarding,
invitaciones, i18n y tema claro/oscuro.

**Operación:** Docker Compose, imagen única o separada, Helm y Coolify.

**Huecos reales — esto es lo que construye Riuna:**

| Hueco | Estado |
|---|---|
| Asignación a **equipos** y **múltiples asignados** | **Hecho** (fase 1) |
| Gestión de equipos (crear, renombrar, miembros) | **Hecho** (fase 1) |
| **Subtareas reales en árbol**, con agregados y cascada | Solo relaciones `subtask` entre pares: no hay `parent_id` ni orden dentro del padre |
| **Épicas**: grupos transversales dentro del proyecto | No existe |
| Campos personalizados | No existe |
| Motor de vistas: filtros guardados, agrupación, columnas, **vista Tabla editable** | No existe |
| Importación CSV/Excel genérica con mapeo | Hay import/export de tareas; hay que generalizarlo |
| Dashboards, widgets, informes y objetivos/OKR | No existe |
| Automatizaciones de usuario | Solo `workflowRule` para eventos de integración |
| Ciclos/sprints, recurrentes, plantillas, "Mi trabajo" | Confirmado inexistente en la auditoría |
| CRM y ERP | No existe (Bloque B) |

---

# BLOQUE A — Productividad

### Fase 0 — Fork, marca y auditoría · **cerrada**
Clonar Kaneo con historia propia conservando `LICENSE` y añadiendo `NOTICE`.
Levantar el entorno, aplicar la marca Riuna, apagar la facturación y escribir
la auditoría de huecos que afina el resto del plan con hechos.
**Hecho cuando:** Riuna corre con su marca, en español, sin rastro de
facturación, y estás dentro creando tareas reales. ✔

### Fase 1 — Uso real y asignación por equipos · **casi cerrada**
**Dogfooding desde aquí: el desarrollo de Riuna se gestiona dentro de Riuna.** ✔
Asignación a un **equipo** y **múltiples asignados** (`task_assignee` aditiva,
sin romper el `userId` existente) ✔, con filtrado y agrupación por equipo en
las vistas que ya hay ✗.
**Copias automáticas con restauración probada** ✔.
**Hecho cuando:** asignas una tarea a un departamento entero, la ves filtrada
por equipo, y restauras un backup sin perder nada.

### Fase 2 — Árbol de tareas y épicas (≈4 semanas)
*Va antes del motor de vistas a propósito: si el motor nace sin saber de
jerarquía, hay que retrofitear el renderizado en árbol, los agregados como
columnas y los filtros de subárbol en las cuatro vistas.*

**Árbol real:** `parent_id`, `path` materializado y `depth` en `task`, con
migración que convierte las relaciones `subtask` existentes en punteros de
padre. Validación anti-ciclo al reparentar y límite de profundidad
configurable (la UI se vuelve inmanejable más allá de ~5 niveles).
**Agregados del subárbol:** progreso por subtareas cerradas, fechas heredadas,
estimación y tiempo sumados. Con **CTE recursiva al leer**; solo se
desnormalizan contadores si el presupuesto de rendimiento lo exige.
**Cascada configurable por proyecto:** cerrar y archivar se propagan hacia
abajo; mover un subárbol reescribe `path` y renumera.
**Épicas:** tabla `epic` por proyecto y `task_epic` muchos-a-muchos.
**Frontend:** árbol plegable en la vista Lista, reparentar arrastrando con
dnd-kit, `Tab` / `Shift+Tab` para degradar y promover, contador de subtareas en
las tarjetas, y barras de resumen en el Gantt.
**Hecho cuando:** descompones una tarea en tres niveles, el padre muestra
progreso y fechas reales de su rama, cerrarlo baja en cascada, y filtras un
tablero por épica.

### Fase 3 — Campos personalizados (≈4 semanas)
`field_definition` (texto, número, moneda, select, multi-select, fecha,
checkbox, usuario, URL, relación→`taskRelation`) por proyecto o por workspace,
y `custom_fields jsonb` con índice GIN en `task`. Validación contra la
definición, en un módulo `fields/` con la convención de Kaneo.
Frontend: editor de campos en ajustes de proyecto, y edición en el detalle y en
las tarjetas.
**Hecho cuando:** defines "Presupuesto (moneda)" y "Cliente (relación)" en un
proyecto y los rellenas desde el detalle de la tarea.

### Fase 4 — Motor de vistas y vista Tabla (≈4 semanas)
Tabla `view` con `type` + `config jsonb` (árbol de filtros, orden, agrupación,
columnas), un registro de descriptores que mapea cada campo lógico a su columna
real o a su ruta JSONB, y un traductor único a SQL de Drizzle con paginación
por cursor.
**Vista Tabla** editable en línea con TanStack Table — lo único que conviene
tomar de fuera (headless y MIT), y que además trae **sub-filas nativas**, justo
lo que el árbol de la Fase 2 necesita.
Consciente de la jerarquía desde el diseño: agregados como columnas ordenables,
filtros "solo raíces / aplanar árbol / incluir subtareas" y agrupación por
épica.
**Y lo más rentable de la fase:** conectar las vistas que **ya existen**
—Tablero, Lista, Calendario, Gantt— al motor de filtros y agrupación, en lugar
de escribirlas.
**Hecho cuando:** filtras `Presupuesto > 1000 AND estado != Hecho`, agrupas por
épica, guardas la vista, la compartes, y el mismo filtro funciona en tablero,
calendario y gantt.

### Fase 5 — Importación y exportación (≈2 semanas)
Generalizar los controladores existentes a **CSV y Excel** con mapeo de
columnas, creación automática de campos personalizados e idempotencia vía
`external_ref`. La jerarquía y las épicas se preservan en ambos sentidos.
Exportación de cualquier vista con sus filtros aplicados.
**Hecho cuando:** importas un Excel de 5.000 filas con jerarquía, creando
campos solo, lo reimportas sin duplicar nada, y exportas una vista filtrada.

*Semana 18: Riuna ya es la plataforma diferencial. Lo que sigue es mejora
incremental sobre algo vivo y en uso.*

### Fase 6 — Ejecución y productividad personal (≈3 semanas)
**Mi trabajo** (tareas propias de todos los proyectos), bandeja unificada,
**ciclos/sprints** con velocidad y burndown apoyados en el registro de tiempo
existente, tareas recurrentes y plantillas de proyecto y de tarea (incluidas
**plantillas de árbol**, que despliegan su jerarquía completa).
**Hecho cuando:** cierras un sprint y ves velocidad real y horas por persona.

### Fase 7 — Dashboards, informes y objetivos (≈3 semanas)
`dashboard`, `dashboard_widget`, `goal`, `goal_target`. Widgets (recuento por
filtro, tarta/barras, tendencia, tiempo registrado, avance por épica, tabla
embebida) sobre el **motor de vistas de la Fase 4** más una capa de agregación.
Objetivos con progreso automático. Exportación de informes a Excel.
**Hecho cuando:** montas un panel de 5 widgets que se recalculan solos y un OKR
trimestral que avanza al cerrar tareas.

### Fase 8 — Automatizaciones e importadores externos (≈3 semanas)
Motor disparador → condición → acción (`automation`, `automation_run`) sobre
los eventos que Kaneo ya emite, ampliando su `workflowRule` en lugar de
sustituirlo. Acciones: cambiar campo, asignar, crear tarea, notificar, webhook.
**Importadores desde Trello, Jira, Asana y Notion**, conservando la jerarquía y
los identificadores en `external_ref`, con adjuntos y comentarios.
**Hecho cuando:** importas un tablero real de Trello con sus adjuntos y una
regla mueve la tarea, avisa y dispara un webhook sin intervención.

### Fase 9 — Operación (≈2 semanas)
Logs estructurados, métricas, límites de tasa, repaso de índices con datos
reales, responsive de las pantallas de consulta móvil, Playwright de humo,
**copias fuera de la máquina** y guía de actualización propia de Riuna.
**Hecho cuando:** restauras un backup en limpio y la suite de humo pasa contra
esa instancia.

---

# BLOQUE B — CRM y ERP ligero (posterior)

Marco para que las decisiones de hoy no lo bloqueen. Modelo funcional guiado
por Dolibarr, implementación propia sobre los motores de las Fases 2, 3 y 4.

### Fase 10 — CRM base
`company` (tercero: cliente / proveedor / prospecto en la misma entidad, como
el `llx_societe` de Dolibarr — evita duplicar la ficha cuando un cliente
también te vende), `contact` y `deal`, con el **pipeline montado como un
proyecto con sus columnas**: tablero, calendario, filtros, comentarios,
actividad, adjuntos, notificaciones, importación y automatizaciones ya
funcionan sobre él.
Vinculación deal ↔ proyecto ↔ tareas reutilizando el patrón de `taskRelation`.

### Fase 11 — Ciclo comercial
Flujo documental de Dolibarr: **presupuesto → pedido → albarán → factura →
cobro**, con líneas, impuestos, moneda, numeración correlativa (exigencia legal
en facturas), estados con categoría e inmutabilidad tras validar, PDF y
conversión de un documento al siguiente arrastrando líneas.

### Fase 12 — ERP ligero
Catálogo de productos/servicios con tarifas, almacenes y stock con
movimientos, y lado de compras.

**Dónde parar:** contabilidad completa, nóminas y fabricación son proyectos en
sí mismos. La decisión por defecto es **no construirlos**: exportar a un
software contable o integrarse con él.

---

## Fuera de alcance

Docs/wiki colaborativa con Yjs (primer candidato del backlog), pizarras, chat
interno, formularios públicos, app móvil nativa, funciones de IA, facturación
de suscripciones.

---

## Verificación

Se aprovecha la infraestructura de pruebas heredada (Vitest unitario e
integración, Playwright, comprobador de i18n).

```bash
pnpm typecheck && pnpm lint && pnpm test
```

**Presupuesto de tests** (acotado a propósito para 8 h/semana):
- **Unitarios:** traductor de filtros → SQL, validación de campos
  personalizados, idempotencia de importación vía `external_ref`, agregaciones
  de los widgets, e **invariantes del árbol**: `path` siempre coherente con
  `parent_id`, imposible crear un ciclo al reparentar, agregados correctos con
  ramas desiguales y con tareas archivadas.
- **Integración** (Postgres del compose, BD por test): cada controlador nuevo
  contra base de datos real.
- **Humo (Playwright):** login → crear proyecto → crear tarea con campo
  personalizado → añadirle dos subtareas → mover en tablero → filtrar y guardar
  vista → exportar.
- **Cero tests unitarios de UI.**
- **Rendimiento:** seed de 50.000 tareas **con árboles de hasta 5 niveles**;
  toda vista < 300 ms p95, revisado con `EXPLAIN` al cerrar las Fases 4 y 9.
- **No romper lo heredado:** ejecutar la suite existente antes y después de
  cada fase; lo que se rompa se arregla o se documenta.

**Antes de cada despliegue:** generar la migración con drizzle-kit y **revisar
el SQL a mano**, y restauración de backup probada tras cualquier migración
destructiva.

---

## Siguiente paso

Cerrar la Fase 1 con el **filtrado y la agrupación por equipo** en las vistas
existentes, y escribir los tests de integración de los controladores de la
fase. Después, Fase 2: el árbol de tareas.

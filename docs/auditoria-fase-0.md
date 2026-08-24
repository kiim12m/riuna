# Auditoría de huecos — Fase 0

**Fecha:** 23 de agosto de 2026
**Base:** fork de Kaneo v2.22.0 (MIT), commit inicial `739438f`
**Método:** búsqueda en `apps/api/src` y `apps/web/src` + lectura de rutas y esquema.

## Huecos que el plan marcaba "por confirmar"

Los cuatro estaban en duda porque se dedujeron del árbol de ficheros, no del código. **Confirmados los cuatro como inexistentes**, así que la Fase 6 mantiene su alcance íntegro.

| Funcionalidad | Resultado | Evidencia |
|---|---|---|
| "Mi trabajo" (tareas propias entre proyectos) | **No existe** | Cero coincidencias de `my-tasks` / `assignedToMe` / `my-work` en `apps/`. La ruta `workspace/$workspaceId/index.tsx` es un **listado de proyectos** con progreso y fecha, no un panel personal |
| Ciclos / sprints, velocidad, burndown | **No existe** | `sprint` / `cycle` / `velocity` / `burndown` solo aparecen en `apps/site` (páginas de marketing y comparativas) y en `apps/docs`. Nada en el código de la aplicación |
| Tareas recurrentes | **No existe** | `recurring` / `recurrence` solo en una guía de `apps/site` |
| Plantillas | **No existe** | Sin módulo de plantillas en `apps/api/src` |

Sí existe una noción de **backlog** (componente `backlog-list-view` y documentación `backlog-planning.mdx`), pero es una vista de lista, no planificación por ciclos.

## Hallazgos adicionales

**Facturación: ya viene desactivada.** No hace falta tocar código. `RIUNA_CLOUD` sin valor y las claves de Creem vacías dejan el billing apagado, y así se ha configurado `.env`. La eliminación del código de billing pasa de tarea de la Fase 0 a limpieza opcional cuando estorbe.

**Redis: opcional.** Sin `REDIS_*` configurado, los WebSockets usan un adaptador en memoria válido para instancia única. Un servicio menos que operar.

**Sentry: opt-in.** Sin `SENTRY_DSN` el SDK ni siquiera se inicializa. Telemetría cero por defecto, sin tocar nada.

**Responsive: cobertura parcial, no nula.** 66 de 264 ficheros `.tsx` usan breakpoints (`sm:`/`md:`/`lg:`), un 25%. El trabajo de la Fase 9 es completar las pantallas de consulta móvil, no partir de cero.

**La marca de Kaneo llega hasta el CSS.** Además de nombres de paquete y textos, hay atributos y clases como `data-kaneo-sortable` y `kaneo-dragging`, y variables de entorno con prefijo `RIUNA_`. El renombrado es mecánico pero más extenso de lo que sugiere el plan.

**El repositorio trae dos aplicaciones que Riuna no necesita:** `apps/site` (web pública de marketing, comparativas y blog de Kaneo) y `apps/docs` (documentación en Mintlify). Son la mayor parte del ruido en las búsquedas de código. Borrarlas reduce el repositorio y la superficie de mantenimiento. **Decisión pendiente.**

**Kaneo ya trae instrucciones para agentes:** `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.agents/` y `skills/`. El `CLAUDE.md` de Riuna debe **adaptar** el existente, no sobrescribirlo.

## Trampas de entorno encontradas al levantarlo

Las tres costaron tiempo real y ninguna da un error que apunte a su causa:

**`dotenv-mono` no fusiona ficheros de entorno: carga solo el de mayor prioridad.** `.env.local` gana a `.env`, así que tener los dos significa que `.env` **no se lee en absoluto**. Con un `.env.local` que solo declaraba las variables de Postgres del contenedor, la API arrancaba sin `POSTGRES_HOST`, sin `AUTH_SECRET` y sin URLs. Riuna usa **un único `.env`**, compartido por la API en el host y por el contenedor vía `compose.local.yml`.

**El modo derivado de la base de datos ignora `DATABASE_URL`.** En cuanto existe `POSTGRES_PASSWORD`, la conexión se deriva de las variables `POSTGRES_*`, y `POSTGRES_HOST` vale `postgres` por defecto — el nombre del servicio de Compose, que no resuelve con la API corriendo en el host. El síntoma es `getaddrinfo ENOTFOUND postgres`.

**Vite cachea los fallos de resolución de imports.** Al crear `ca-ES.json` con el servidor de desarrollo ya arrancado, Vite siguió sirviendo un 500 con "Failed to resolve import" pese a existir el fichero. Se arregla reiniciando el servidor, no tocando el código.

**Puerto de Postgres:** el 5432 lo ocupa otro proyecto de esta máquina, así que Riuna publica el suyo en el **5433**.

## Impacto en el plan

- **Fase 6 (Ejecución y productividad personal): sin cambios**, los cuatro huecos son reales. Con "Mi trabajo", sprints, recurrentes y plantillas dentro, 3 semanas es una estimación ajustada.
- **Fase 0: menos trabajo del previsto.** Facturación, telemetría y Redis se resuelven por configuración; el renombrado de la marca es más amplio de lo estimado. Se compensan.
- **Fase 9: menos trabajo del previsto** en responsive, al haber ya un 25% de cobertura.

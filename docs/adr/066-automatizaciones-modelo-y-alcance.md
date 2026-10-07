# ADR 066 — Automatizaciones: modelo y alcance

**Fecha:** 2026-10-05 · **Estado:** aceptada

**Contexto.** La Fase 8 pide reglas de usuario de la forma «cuando pasa algo, si la tarea
cumple esto, haz aquello», ampliando `workflow_rule` en vez de sustituirlo. Esa tabla
solo mapea un evento de GitHub o Gitea a una columna. El usuario decidió que haya reglas
de proyecto **y** de espacio (2026-10-05).

**Decisión.**

- **Dos tablas nuevas, nada tocado de lo heredado.**
  - `automation` lleva:
    - `trigger_type`, en su columna porque es por lo que se busca en cada evento;
    - en `jsonb`: la configuración del disparador, las condiciones y las acciones;
    - `project_id` nulo para una regla de espacio;
    - `team_id` para el envío del stand-up;
    - `paused_reason`.
  - `automation_run` guarda el historial de cada ejecución.
  - La forma la valida la API con Valibot (`automation/definition.ts`), no la base:
    añadir un disparador no exige migración.
- **`workflow_rule` sigue siendo lo que era.** Sus movimientos publican
  `task.status_changed`, y una automatización reacciona a ellos como a cualquier otro.
  Encadenar sustituye a duplicar.
- **La condición son las mismas condiciones editables que un widget** (ADR 015), compiladas
  por el motor de filtros (ADR 014). Se guarda lo que la barra de filtros tiene en pantalla.
  Una regla de espacio usa el registro del espacio, que trae solo los campos de espacio.
- **Una regla de espacio no nombra columnas.** Las columnas son de cada proyecto, así que
  dice «a una columna final» y «marcar hecha», nunca «mover a En curso».
- **Permisos según la regla, no fijos por ruta** (`automation/permissions.ts`):

  | Regla | Permiso que exige |
  |---|---|
  | De proyecto | `project:update`, lo mismo que columnas y campos |
  | De proyecto que saca datos fuera (webhook o chat) | además `workspace:manage_settings`, como una integración |
  | De espacio | `workspace:manage_settings` |

  Al editar se exige lo más estricto de antes y de después: quitar un webhook también es
  tocar lo que sale fuera.
- **Los secretos se cifran y no salen nunca.** Son el secreto del webhook, la URL del
  webhook de Slack o Discord (que es en sí la credencial del canal) y el token del bot de
  Telegram.
  - Se cifran con la misma clave que los de las notificaciones.
  - La API devuelve `hasSecret` y no el secreto.
  - Al editar, un secreto ausente conserva el guardado y uno vacío lo quita. Para eso cada
    acción lleva un `id` estable.
  - Sin `NOTIFICATION_SECRET_ENCRYPTION_KEY`, guardar un secreto es un 400 que dice qué
    falta, no el 500 mudo de las notificaciones.
- **Se valida al guardar todo lo que la regla nombra**: columnas, campos y sus valores,
  etiquetas, personas, equipos, destinos y condiciones. Una regla que el motor rechazara
  después fallaría en silencio en cada evento.
- **Archivar, no borrar**: el historial de lo que hizo sigue consultable.

**Consecuencias.**

- El permiso no se puede declarar en la ruta: cada una lo calcula con
  `hasWorkspacePermission`, que comprueba también el alcance de la clave de API.
- `roleHasWorkspacePermission` sale de `hasWorkspacePermission`. El motor tiene que
  comprobar sin petición de por medio que quien guardó la regla sigue pudiendo (ADR 067).
- La lista de reglas no viaja por WebSocket. Es una pantalla de ajustes de quien
  administra, que relee al montar.

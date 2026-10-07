# ADR 068 — El stand-up sale de Riuna, y las reglas por fecha

**Fecha:** 2026-10-05 · **Estado:** aceptada

**Contexto.** El interludio decidió que el stand-up solo lo ven la persona y su
responsable (2.4, ADR 059). Enviarlo a Slack o Telegram se aplazó a la Fase 8 como
acción de automatización: las integraciones de chat son por proyecto, y un departamento
no es un proyecto. La Fase 8 trae además disparadores por fecha, que no vienen de ningún
evento del bus.

**Decisión.**

- **Un tercer tipo de disparador, `schedule`** (días de la semana y hora de Madrid), solo
  para la acción `standup`.
  - Una regla programada es de espacio, nombra un departamento (`automation.team_id`) y
    solo envía stand-ups.
  - No tiene condiciones: no actúa sobre ninguna tarea.
  - Ninguna otra regla nombra un departamento ni envía un stand-up.
- **Quién lo programa: un admin del espacio o el responsable de ese departamento**, por
  decisión del usuario (2026-10-05).
  - El responsable solo gestiona los envíos de su equipo.
  - Solo desde su sesión: una clave de API no lleva ese permiso.
  - La regla sigue corriendo mientras quien la guardó siga pudiendo, como cualquier otra
    (ADR 067).
- **Enviarlo amplía, a propósito, quién lo lee.** El canal lo elige quien lo programa, y
  esa persona decide quién lee el stand-up de su gente. La valoración del día no sale
  nunca: el texto sale de `loadStandups`, que no la lee, y la prueba de arquitectura de la
  ADR 054 vigila toda la API.
- **Cuándo sale:**
  - una vez al día, a partir de su hora;
  - si la instancia estuvo parada, sale al volver, ese mismo día;
  - en festivo no sale, y queda anotado;
  - quien está ausente no aparece;
  - el «ya enviado» es la ejecución del día (`automation_run.occurrence`).
- **El texto es el mismo Markdown que copia la persona.** `standupMarkdown` tiene una
  segunda copia en la API (`review/standup-text.ts`) con una prueba de paridad, como
  `buildFilter`.
  - No va a `packages/libs`, como decía el plan: ese paquete depende de la API para los
    tipos del cliente.
  - La negrita se adapta a cada canal: Discord la lee tal cual, Slack con un asterisco y
    Telegram sin formato.
- **Disparadores por fecha:** `task.due_in` (vence en N días o menos y aún no ha vencido)
  y `task.overdue`.
  - Usan las mismas fronteras de día que `utils/due-window.ts`.
  - «Vencida» salta desde el día siguiente al vencimiento, y no avisa de lo que ya
    llevaba más de una semana vencido.
  - El «ya disparado» va en `task_reminder_sent` con la clave `automation:<id>`, que se
    apunta antes de actuar. El disparador de la 0069 la vacía al cambiar el vencimiento,
    así que mover la fecha rearma la regla.
  - No actúan sobre lo terminado ni lo archivado.
- **Un solo trabajo cada cinco minutos** (`automations`), con arrendamiento: enviar un
  stand-up o un webhook no es idempotente. A la hora en punto purga el historial de más
  de 30 días.

**Consecuencias.**

- **Medido** en el banco de 50.000 tareas:

  | Consulta | Tiempo |
  |---|---|
  | Reglas que responden a un evento | 0,14 ms |
  | «Vence en 3 días», regla de espacio | 1,3 ms |
  | «Vencidas», regla de espacio | 0,9 ms |
  | «Vence en 3 días» con 20.000 marcas «ya disparado» | 10 ms |

  Las de fecha van por `task_dueDate_idx`. La última corre una vez por regla y por
  vuelta, no en cada petición.
- Como mucho 200 tareas por regla y vuelta; el resto sale en la siguiente.
- Editar una regla por fecha no la rearma: cada tarea avisa una vez por regla y por
  vencimiento.

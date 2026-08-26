# ADR 010 — Asignación a equipos y múltiples asignados

**Fecha:** 2026-08-27 · **Estado:** aceptada

**Contexto.** Kaneo trae una sola columna de responsable, `task.assignee_id`, y la lee media aplicación: notificaciones, filtros, tarjetas, integraciones y el servidor MCP. Riuna necesita dos cosas que esa columna no da: **repartir trabajo a un departamento entero** —el requisito que motivó la Fase 1— y **varias personas en una misma tarea**. Los equipos ya existían heredados (`team` y `teamMember`, del plugin de organización de Better Auth), pero no había forma de asignarle una tarea a uno.

**Decisión.** Aditiva, sin tocar lo heredado:

- **`task.team_id` es una columna nueva, independiente del asignado individual.** No es un asignado más: una tarea puede pertenecer a un departamento sin tener todavía una persona concreta detrás, y el equipo sobrevive a los cambios de pertenencia que una lista de asignados no reflejaría. Se borra a `null` si el equipo desaparece, y va indexada porque se filtra y se agrupa por ella.
- **`task_assignee` guarda el conjunto completo, incluido el responsable principal.** Repetir el principal dentro de la tabla es deliberado: así «quién tiene esta tarea» es una consulta, no una unión de la tabla con la columna.
- **`task.assignee_id` sigue siendo el responsable principal y no se toca.** Es el primero de la lista al reemplazarla. Todo lo heredado que lo lee sigue leyendo algo cierto, y no hubo que revisar notificaciones, integraciones ni filtros.
- **Un único sitio escribe la tabla**, `task/controllers/assignees.ts`, con `replaceAssignees` y `syncPrimaryAssignee`, para que las dos vías de asignación —la heredada de un solo responsable y la de varios— no puedan divergir. Al reemplazar, solo se borran las filas de quien ya no está: conservar las que siguen mantiene su `created_at`.
- **La autorización no se relaja.** Los asignados tienen que ser miembros del espacio y el equipo tiene que ser del espacio del proyecto; un equipo inexistente y uno ajeno devuelven el mismo 403, porque distinguirlos serviría para sondear qué ids existen fuera del propio.

**Por qué no las alternativas.** Sustituir `assignee_id` por la tabla era el diseño limpio y habría obligado a tocar todos los consumidores heredados de golpe, que es justo el tipo de reescritura que un fork de una persona no se puede permitir. Tratar el equipo como un asignado más —una fila en `task_assignee` apuntando a un equipo— ahorraba una columna y perdía la distinción que hace útil el reparto por departamento: a quién le toca *ahora* frente a de quién *es* el trabajo. Un array en la propia tarea no habría podido consultarse ni indexarse como una relación.

**Consecuencias.**

- **Hay dos verdades sobre quién tiene la tarea y hay que mantenerlas juntas.** El precio de no reescribir lo heredado. Está acotado a un módulo, y los tests de integración de la fase cubren que la vía heredada mantenga la tabla al día.
- **Los equipos reparten, no aíslan.** Todo el mundo sigue viendo todas las tareas; el equipo es un destinatario, no un límite de visibilidad. Añadirle permisos después sería otra decisión, y no esta.
- **El orden dentro de un mismo lote de asignación no está definido.** Las filas entran en una sola sentencia y `created_at` usa `now()`, que en PostgreSQL es el de la transacción: todas comparten marca de tiempo. `created_at` distingue lotes, no personas dentro de un lote. Solo afecta al orden de los avatares; quién es el responsable principal sí está definido.
- **Asignar exige `task:assign`, que en los roles heredados solo tienen `admin` y `owner`.** Un miembro puede crear y editar tareas pero no repartirlas, ni a una persona ni a un departamento. No se decidió aquí, se heredó, y conviene saberlo antes de prometer que cualquiera reparte trabajo: cambiarlo es tocar `packages/permissions`.
- **Las tarjetas de tablero y lista siguen enseñando solo al responsable principal.** La lista completa vive en el detalle. Es deuda anotada en el plan, no un límite del modelo.
- **Una tabla nueva no basta con definirla.** `task_assignee` se quedó fuera del registro de esquema de `database/index.ts` durante toda la fase; los controladores importan la tabla directamente y por eso nada fallaba, pero `db.query.taskAssigneeTable` no existía y la relación `task → assignees` no se podía recorrer. Lo destapó el primer test de integración que la leyó por el registro.

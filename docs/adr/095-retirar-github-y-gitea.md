# ADR 095 — Se retiran las integraciones de GitHub y Gitea

**Fecha:** 2026-10-25 · **Estado:** aceptada · **Decisión D2 de la
[auditoría de octubre](../auditoria-2026-10.md)**

**Contexto.** Kaneo traía GitHub y Gitea como integraciones bidireccionales (una cuarta parte de
`plugins/` y once puntos de escritura sin bloqueo en `external_link`). Riuna se usa con chats
(Discord, Slack, Telegram) y webhook genérico; con los repositorios no. Eran unas 9.000 líneas con
fallos propios: Gitea numeraba con `max + 1`, GitHub no usaba transacción.

**Decisión.** Se borran la API (`github-integration`, `gitea-integration`, `plugins/github`,
`plugins/gitea`, `external-link`, la sincronización de etiquetas), la web (ajustes, buscador de
repositorios, acordeón de enlaces, insignias de PR), `octokit` y las variables `GITHUB_APP_*`.
Con ellas sale `workflow_rule`, que solo servía para decir a qué columna llevaba cada evento de
GitHub o Gitea. El inicio de sesión con GitHub (`socialProviders.github`) **no** es la integración y
se queda, igual que `riuna-issue-link` en el editor (enlace a una tarea, no a una incidencia).

**Consecuencias.**

- La migración `0096` borra las filas de `integration` de tipo `github` y `gitea` (llevan el token y
  el secreto del webhook en claro) y las tablas `external_link`, `github_integration` y
  `workflow_rule`. Antes repara `project.last_task_number` con `GREATEST(…, max(number))`, por si
  se llegó a importar de Gitea.
- Los datos que borra no se exportan: la copia que precede a cada actualización (ADR 071) los
  conserva. Los comentarios que ya vinieran de GitHub se quedan, sin la insignia.
- Las claves i18n y las variables de entorno de la integración se van con ella.

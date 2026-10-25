# ADR 097 — Se retira `packages/planka-import`

**Fecha:** 2026-10-25 · **Estado:** aceptada · **Decisión D3 de la
[auditoría de octubre](../auditoria-2026-10.md)**

**Contexto.** El paquete era una CLI heredada que leía PLANKA por su API y escribía en Riuna por la
API pública con una API key. La [ADR 070](070-como-se-anade-un-importador-externo.md) ya descartó
ese camino para los importadores nuevos (no puede fechar comentarios, dispara avisos, no usa
`external_ref` ni transacción), y la migración de PLANKA que importaba se hizo hace tiempo.

**Decisión.** Se borra el paquete, su volumen de `node_modules` en el devcontainer y sus menciones en
la documentación. Si hiciera falta otra migración, se hace como adaptador del lado del servidor,
según la ADR 070.

**Consecuencias.**

- Una dependencia y un paquete menos que mantener y compilar en el CI.
- `externalSource` sigue admitiendo `planka`, `trello` y `jira` en `POST /comment`: es el origen que
  llevan los comentarios ya importados, y quitarlo no ganaría nada.

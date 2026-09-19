# ADR 002 — Eliminar `apps/site` y `apps/docs`

**Fecha:** 2026-08-23 · **Estado:** aceptada

**Contexto.** El fork traía la web pública de Kaneo (`apps/site`: marketing, comparativas contra Jira y Linear, blog) y su documentación en Mintlify (`apps/docs`). Son producto de Kaneo, no del gestor de proyectos. Sumaban 294 ficheros y dominaban los resultados de cualquier búsqueda de código: la propia auditoría de la Fase 0 lo sufrió.

**Decisión.** Eliminarlas, junto con el workflow `deploy-site.yml`, que existía solo para desplegarlas.

**Consecuencias.**
- Repositorio y superficie de mantenimiento menores; búsquedas de código limpias.
- `pnpm typecheck` sigue en verde tras la eliminación.
- `.github/workflows/update-contributors.yml` queda apuntando a un `apps/site` inexistente: entra en la limpieza de workflows, aún pendiente.
- Si algún día hacen falta, están en el repositorio original de Kaneo.

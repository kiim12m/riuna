# ADR 098 — El único despliegue es `compose.local.yml`

**Fecha:** 2026-10-25 · **Estado:** aceptada · **Decisión D3 de la
[auditoría de octubre](../auditoria-2026-10.md)**

**Contexto.** Kaneo se podía desplegar de cuatro maneras: imagen única con nginx
(`Dockerfile.riuna`), `compose.yml`, `compose.coolify.yml` y un chart de Helm con su flujo de
publicación. Riuna corre en el PC con `compose.local.yml` (ADR 071) y nunca ha usado las demás:
`compose.yml` apuntaba a una imagen que no existe y, al ser el nombre por defecto de Compose,
olvidar `-f compose.local.yml` daba un error que no se parecía a su causa.

**Decisión.** Se borran `Dockerfile.riuna`, `apps/web/nginx.riuna.conf`, `deploy/riuna-entrypoint.sh`,
`compose.yml`, `compose.coolify.yml`, `charts/` y los flujos `helm-chart.yml` y `helm-validate.yml`.
`build-images.yml` publica solo `api` y `web`, y el trabajo `docker-build` del CI construye esas dos
en vez de la imagen única. `AGENTS.md`, el README y `docs/` dicen que el despliegue es uno. Redis
sigue siendo opcional.

**Consecuencias.**

- Se acaba la superficie de despliegue que nadie probaba y el riesgo de editar un fichero que no
  corre. El restore-drill ya construía las imágenes de `compose.local.yml`.
- Volver a otro despliegue (Helm, Coolify) obliga a una ADR nueva y a probarlo; el historial de git
  conserva los ficheros.
- `scripts/release/apply-version.mjs` deja de sellar `charts/riuna/Chart.yaml`.
- Las ADR y el plan anteriores siguen nombrando los ficheros borrados: son historia.

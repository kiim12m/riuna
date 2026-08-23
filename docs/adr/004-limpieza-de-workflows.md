# ADR 004 — Limpieza de los workflows heredados

**Fecha:** 2026-08-23 · **Estado:** aceptada

**Contexto.** El fork traía 14 workflows de GitHub Actions. La mayoría no automatizaban el producto, sino a Kaneo como proyecto de código abierto: publicaban paquetes npm bajo `@kaneo/*`, notificaban a su Discord, asignaban issues a su mantenedor, sincronizaban sus patrocinadores y cortaban releases con semantic-release. Varios habrían fallado, y los de npm habrían intentado publicar paquetes ajenos.

**Decisión.** Eliminar ocho: `release.yml`, `publish-mcp.yml`, `publish-planka-import.yml`, `update-contributors.yml`, `issue-notify.yml`, `release-notify.yml`, `auto-assign.yml` y `auto-merge.yml`. Con ellos se van `release.config.js`, `scripts/release/notes.mjs`, `scripts/release/emit-version.mjs` y cinco dependencias de desarrollo de semantic-release.

Se conservan seis: `ci.yml` y `nightly.yml` porque son la red de seguridad, y `docker.yml` → `build-images.yml` y `helm-chart.yml` → `helm-validate.yml` porque publican bajo `ghcr.io/<owner>/…`, es decir, en el espacio de nombres propio, y sirven para desplegar Riuna.

**Consecuencias.**
- Riuna deja de tener versionado automático. Los Conventional Commits siguen siendo obligatorios por commitlint, pero ahora compran historia legible, no releases.
- `auto-merge.yml` cae aunque Dependabot siga configurado: fusionar actualizaciones de dependencias sin revisión es un riesgo de cadena de suministro que un proyecto de una sola persona no debería asumir. Los PR de Dependabot se revisan a mano.
- `scripts/release/apply-version.mjs` **se queda**: `build-images.yml` lo usa para sellar la versión en las imágenes.
- Los workflows de imágenes y de Helm no deben ejecutarse hasta renombrar sus artefactos, que todavía se llaman `kaneo`, `web`, `api` y `charts/kaneo`.

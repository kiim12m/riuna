# ADR 099 — MCP solo por HTTP: se retira `packages/mcp`

**Fecha:** 2026-10-25 · **Estado:** aceptada · **Decisión D4 de la
[auditoría de octubre](../auditoria-2026-10.md)**

**Contexto.** Había dos caminos a las mismas herramientas: el servidor HTTP de la API
(`/api/mcp`, con OAuth 2.1) y el paquete stdio `@riuna/mcp`, que repetía las 71 herramientas
llamando a la API pública. Mantenerlas iguales exigía una prueba de paridad, y aun así el paquete
se había quedado sin las del plan personal y el cronómetro. Riuna se usa desde Claude Code por
HTTP; el paquete stdio no se publicaba ni lo usaba nadie.

**Decisión.** Se borra `packages/mcp` y sus referencias (README, SECURITY, ENVIRONMENT_SETUP,
AGENTS, devcontainer, docs). La prueba de paridad pasa a `mcp-tool-parameters.test.ts`, que solo
vigila que las herramientas HTTP conserven los parámetros que ya se perdieron una vez. El cliente de
confianza `riuna-mcp` sale del flujo de dispositivo por defecto: solo lo usaba el instalador del
paquete (`riuna-cli` se queda). El nombre `riuna-mcp` del servidor HTTP en su `serverInfo` no cambia.

**Consecuencias.**

- Una sola copia de las herramientas: añadir una es tocar `apps/api/src/mcp/tools`.
- Quien necesite stdio tendrá que usar un puente genérico (`mcp-remote`) contra `/api/mcp`.
- Una instancia que fijara `DEVICE_AUTH_CLIENT_IDS` con `riuna-mcp` sigue funcionando: es un
  valor de configuración, no código.

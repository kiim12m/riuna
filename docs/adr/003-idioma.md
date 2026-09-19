# ADR 003 — Español en el producto, inglés en el código

**Fecha:** 2026-08-23 · **Estado:** aceptada

**Contexto.** El equipo es español y Riuna es de uso interno. Kaneo ya trae i18next montado, con `i18n/en-US.json` como fuente de verdad de las claves. El plan original contemplaba prescindir de la capa de i18n; con el fork eso pasó a ser trabajo de demolición sin ganancia.

**Decisión.** Conservar i18next. El español es el idioma por defecto de la interfaz. El código, los identificadores, los comentarios y las claves de traducción siguen en inglés.

**Idiomas.** Se conservan `es-ES` (por defecto y de reserva), `en-US` (fuente de verdad de las claves) y `ca-ES`. Los otros 15 que traía Kaneo se eliminaron.

**Estado del catalán.** Parcial y honesto: `common` y `navigation` están traducidos de verdad; el resto se rellenó desde el español para que el comprobador `pnpm i18n:check` exija paridad de claves y CI quede en verde. Un usuario en catalán ve catalán en la navegación y español en el resto — lo mismo que vería con el mecanismo de reserva, pero sin claves ausentes. Queda pendiente traducir `tasks`, `auth`, `activity` y `settings`.

**Consecuencias.**
- No hay que tocar la infraestructura de i18n: solo traducir y cambiar el locale por defecto.
- Añadir otro idioma más adelante es traducir un fichero, no refactorizar.
- El selector de idiomas usa `Intl.DisplayNames`, así que un idioma nuevo aparece con su nombre nativo sin añadir claves.
- Los ficheros de idioma tienen **tres consumidores**, no uno: la web, `apps/api/src/utils/get-workspace-invitation-email-copy.ts` y los tests de `packages/email`. Eliminar un idioma obliga a revisar los tres.
- `AGENTS.md` se mantiene en inglés por ser texto heredado: reescribirlo en español generaría deriva respecto al original sin beneficio funcional.
- Los documentos propios de Riuna (`docs/`, ADR) se escriben en español.

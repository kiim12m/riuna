# ADR 073 — Logs estructurados, sin dependencia

**Fecha:** 2026-10-11 · **Estado:** aceptada

**Contexto.** La API registraba con unas 300 llamadas `console.*` repartidas por 87 ficheros,
sin nivel, sin forma y sin nada que uniera las líneas de una misma petición. Y lo grave:
**un 500 no dejaba rastro.** `app.onError` solo llamaba a `Sentry.captureException`, y Sentry
está inactivo sin DSN. Tampoco había una línea por petición, así que no se sabía qué rutas se
usaban ni cuánto tardaban.

**Decisión.**

- **`utils/log.ts`, sin dependencia.** Son unas 150 líneas, y a este volumen pino no aporta nada
  que no quepa aquí.
  - JSON por línea con `NODE_ENV=production` (la imagen) y una línea legible en desarrollo.
    `LOG_FORMAT` lo fuerza.
  - `LOG_LEVEL`, `info` por defecto. Lo de nivel `warn` y `error` va a `stderr`.
  - **La firma es la de `console`**, para que el cambio fuera mecánico:
    - el primer texto es el mensaje;
    - los objetos planos se funden como campos;
    - un `Error` va a `error`, con su pila y su causa;
    - lo demás va a `details`.
  - **Nunca escribe secretos.** Un campo que suene a contraseña, token, cookie, clave de API o
    credencial sale como `[redacted]`, a cualquier profundidad.
- **Una línea por petición** (`utils/request-log.ts`), con:
  - `requestId`, que respeta un `X-Request-Id` razonable y lo devuelve en la respuesta;
  - método, **patrón de la ruta que respondió**, estado, duración y usuario.
  - Todo lo que se registra durante la petición lleva su `requestId`, por `AsyncLocalStorage`.
  - **Nunca la ruta cruda**, ni la query, ni los cuerpos: el token del calendario `.ics` va en la
    ruta, y en la de restablecer la contraseña también.
  - `/api/health` no se registra: Docker pregunta cada 30 s.
- **Todo 500 se registra** con su pila, su ruta y su `requestId`, y después va a Sentry si está
  activo.
- **Cada trabajo programado** deja una línea al acabar: `debug` si fue bien (cada cinco
  minutos, sería ruido), `warn` si fue a medias y `error` si falló.
- **`console.*` queda prohibido en `apps/api/src`** salvo en el propio logger. Lo vigila
  `tests/api/no-console.test.ts`. Los guiones de `apps/api/scripts/` imprimen a la consola,
  que es lo suyo.
- `compose.local.yml` rota los logs de cada contenedor (`json-file`, 5 × 10 MB). Docker Desktop
  no los rota por defecto, y con una línea por petición crecerían sin límite.

**Consecuencias.**

- `docker compose logs api` enseña JSON. Para leerlo a ojo en el PC, `LOG_FORMAT=pretty` en el
  `.env`.
- Las pruebas que espiaban `console` espían ahora `log`.
- El Bloque 4 tomará de aquí los tiempos por ruta para el estado de la instancia.

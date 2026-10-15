# ADR 079 — Sesiones activas

**Fecha:** 2026-10-12 · **Estado:** aceptada

**Contexto.** Punto 1.4 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado):
ver dónde está abierta la cuenta y cerrar lo que sobre. Better Auth guarda las sesiones en la
tabla `session`, con navegador e IP. Su `listSessions` devuelve también el **token** de cada
sesión, que es la credencial de ese dispositivo.

**Decisión.**

- **Rutas propias en `/api/session`**, en vez de las de Better Auth.
  - La lista devuelve el `id` y nunca el token: un XSS que la leyera no podría entrar en los
    otros dispositivos.
  - Cerrar una sesión borra su fila por `id` y por persona.
  - «Cerrar todas menos esta» borra el resto.
  - La sesión actual no se cierra desde aquí: para eso está salir.
- **Solo desde una sesión de navegador**: una clave de API no es una sesión y no puede echar a
  nadie de su cuenta (403).
- **Qué enseña**: navegador y sistema, deducidos del `User-Agent` sin dependencia nueva; la IP;
  cuándo entró; cuándo caduca; y si es una suplantación de un administrador. No enseña la
  «última actividad»: Better Auth solo renueva la sesión una vez al día y la caché de cookie
  evita leerla, así que esa hora engañaría.
- **Ajustes › Seguridad**, una página nueva de la cuenta. Sin MCP: gestionar sesiones no es cosa
  de un agente.

**Consecuencias.**

- **Cerrar no es instantáneo**: la caché de sesión en cookie (`cookieCache`, 5 minutos) deja al
  dispositivo cerrado trabajar hasta que caduca. La página lo dice.
- La IP es la que ve la API: detrás de Tailscale, una 100.x.

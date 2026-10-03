# ADR 057 — Exportar el calendario por un enlace con token

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** El plan con hora, los bloques del Cronograma y los vencimientos
solo se veían dentro de Riuna. Lo decidido con el usuario fue **exportar en
ICS e importar iCal**; importar (el 4.2) quedó aplazado al cerrar esto. Un
calendario externo se suscribe a una URL y la vuelve a pedir cada pocas
horas, sin sesión ni cabeceras: la URL tiene que llevar su propia
credencial.

**Decisión.**

- **`calendar_feed`**, uno por persona y espacio (único
  `(workspace_id, user_id)`). Guarda solo el **sha256 del token**: 32 bytes
  aleatorios en base64url, que se enseñan una vez al crearlo. Regenerar
  cambia el hash y revocar borra la fila; los dos matan el enlace anterior al
  momento.
- **Solo con sesión.** `POST`, `GET` y `DELETE /calendar/feed` rechazan las
  claves de API. Si no, una clave de solo lectura podría fabricar una
  credencial permanente y sin autenticación.
- **`GET /api/calendar/:token.ics`** va antes del middleware de
  autenticación. En cada petición se busca el hash y se comprueba que la
  persona sigue en el espacio: sacarla del espacio corta su enlace. Lo
  generado se guarda en memoria cinco minutos por enlace, y eso es también
  el límite: como mucho una generación cada cinco minutos por enlace e
  instancia.
- **Escritor propio** (`calendar/ics-writer.ts`), sin dependencias:
  - plan con hora, del tamaño que le da el Cronograma (la estimación, 30
    minutos sin ella, 10 como mínimo), en UTC. Las tareas terminadas llevan
    «✓»;
  - bloques sueltos, en UTC;
  - bloques repetidos de intervalo 1 (y los mensuales hasta el día 28) como
    `RRULE` con `TZID=Europe/Madrid` y su `VTIMEZONE`, desde el día en que se
    crearon. Así la hora de pared se mantiene al cambiar la hora. Los demás
    se escriben ocurrencia a ocurrencia, proyectados igual que en el
    Cronograma; también todos si la API no corre en Madrid;
  - vencimientos de lo asignado sin terminar, como días enteros.

  La ventana va de 30 días atrás a 90 adelante. Una fila mal formada se
  salta, como en el Cronograma.

**Consecuencias.**

- **Quien tenga el enlace ve esos títulos.** El ajuste lo dice, y el enlace
  se puede regenerar o revocar.
- **Los cambios tardan en llegar.** Hasta cinco minutos por la caché, y lo
  que tarde cada calendario en volver a pedirlo: Google, horas.
- **La fase de una cadencia de intervalo mayor que 1 no tiene ancla propia**
  (deuda de la ADR 041), y solo se crea por la API: se exporta como la
  proyecta el Cronograma sobre la ventana.
- **Verificado:**
  - pruebas unitarias del escritor: escapado, plegado de líneas con
    caracteres de varios bytes, días enteros, `RRULE` con `UNTIL` y la
    `VTIMEZONE`;
  - de integración: enlace mostrado una vez, revocado y regenerado,
    persona sacada del espacio, otro espacio, clave de API rechazada y el 25
    de octubre;
  - de extremo a extremo, del ajuste al `.ics`.

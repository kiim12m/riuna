# ADR 075 — Estado de la instancia y alertas, sin servicios de fuera

**Fecha:** 2026-10-11 · **Estado:** aceptada

**Contexto.** Saber si la instancia del PC estaba sana exigía abrir una terminal:

- `docker compose ps`;
- los logs;
- `ls backups/`;
- y para los trabajos programados, nada: solo informaban a Sentry, que está inactivo.

El usuario eligió (2026-10-10) dos cosas:

- una página «Estado de la instancia» para su admin;
- alertas por los canales que ya existen (ntfy, Gotify, correo, webhook).

Y descartó:

- Prometheus (`/metrics`), porque no hay nadie que lo lea;
- activar Sentry por ahora.

**Decisión.**

- **`job_status`, una fila por trabajo programado** (migración 0083):
  - última vuelta, estado (`ok`, `degraded` o `error`), duración, último éxito, fallos seguidos y
    último error;
  - la escribe el envoltorio `withCheckIn` del planificador, así que vale para los siete
    trabajos sin tocarlos;
  - va en la base, no en memoria, porque sobrevive a un reinicio y vale con varias instancias;
  - del error, cada URL se queda en su origen, porque el token puede ir en la consulta o en la
    ruta (Telegram, Discord, Slack), y se corta lo que va tras `params:`, que son los datos de la
    consulta que falló;
  - una vuelta que se salta porque otra instancia tiene el arrendamiento no se apunta: contarla
    como buena ponía a cero los fallos de la que sí corre.
- **Tiempos por ruta en memoria** (`utils/route-metrics.ts`):
  - las últimas 200 duraciones de cada patrón, y de ahí el p50 y el p95;
  - se pierden al reiniciar, y la página lo dice;
  - los preflight de CORS no cuentan.
- **`GET /api/instance/report`**, solo para el admin de instancia y solo con sesión. Enseña:
  - versión, commit (`RIUNA_REVISION`, sellado en la imagen) y tiempo en marcha;
  - base: tamaño, versión de PostgreSQL y migraciones aplicadas frente a las empaquetadas;
  - los trabajos;
  - las copias, la local y la externa, desde `BACKUP_DIR`, que `compose.local.yml` monta de solo
    lectura;
  - Redis y las conexiones WebSocket;
  - las rutas lentas, los problemas y las alertas abiertas;
  - **la IP con la que la API ve a quien pregunta**, que sirve para comprobar en el PC que
    `tailscale serve` pasa la del cliente (ADR 074).
- **La página**, en el menú del avatar, solo para el admin de instancia. Se refresca cada minuto.
- **Alertas: el trabajo `instance-health`**, cada 15 minutos y con arrendamiento.
  - **Condiciones** (`instance/health.ts`, pura, la misma que enseña la página):
    - la última copia local tiene más de `BACKUP_INTERVAL_HOURS` + 2 h, o no hay ninguna;
    - `BACKUP_DIR` está definido pero no se puede leer (el montaje se perdió). Mientras dure, las
      alertas de copias abiertas siguen abiertas: no saber no es estar bien;
    - la copia externa no sube desde hace dos intervalos y una hora, o no ha subido nunca;
    - un trabajo lleva tres fallos seguidos.
  - **Una alerta por condición** (`instance_alert`, con un índice único mientras está abierta):
    avisa al abrirse y otra vez al resolverse, con el tipo `instance_alert`.
  - **Sale por los canales de las preferencias generales** del admin (correo, ntfy, Gotify,
    webhook). No es de ningún espacio, así que no pide regla de espacio; el webhook la manda con
    `workspace: null`.
  - **Cada problema va dos veces**: `kind` y `params`, que la página y la campana traducen con
    claves estáticas, y el texto en español ya montado, para los canales externos, que no pasan
    por las traducciones de la web.
  - **Lo que la API no sabe no alerta**: sin `BACKUP_DIR` no hay alertas de copias.

**Consecuencias.**

- **Si la API está caída, no avisa nadie.** Haría falta un vigilante fuera de la máquina, y queda
  fuera de alcance.
- Los tiempos por ruta son de un proceso. Con varias instancias, cada página enseña la suya.
- Activar Sentry más adelante no cambia nada de esto: los dos conviven.
- La revisión de código de la Fase 9 corrigió la entrega por canales, el arrendamiento, los
  secretos del error, el directorio ilegible y las traducciones (`docs/plan.md`).

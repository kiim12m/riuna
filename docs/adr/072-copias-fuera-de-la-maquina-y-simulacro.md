# ADR 072 — Copias fuera de la máquina, y el simulacro de restauración

**Fecha:** 2026-10-11 · **Estado:** aceptada

**Contexto.**

- Las copias vivían en el mismo disco que la base: un fallo de ese disco se llevaba la
  instancia y sus copias.
- La restauración se había probado a mano una vez (agosto de 2026).
- El criterio de la Fase 9 es «restauras una copia en limpio y el humo pasa contra esa
  instancia».
- El usuario decidió (2026-10-10):
  - la copia externa va a Google Drive, cifrada;
  - el simulacro se hace dos veces: uno sintético cada noche en CI, y otro con la copia real
    en el PC, que nunca baja a desarrollo.

**Decisión.**

- **Un servicio `offsite` en `compose.local.yml`** (imagen de rclone) que lanza
  `scripts/backup/offsite.sh` cada `OFFSITE_INTERVAL_HOURS`.
  - Va en un perfil: sin remoto creado solo fallaría. Se enciende con
    `COMPOSE_PROFILES=offsite`.
  - No lee el `.env` entero; solo sus variables.
  - El remoto es `drive` con un `crypt` encima, así que Google no ve ni nombres ni contenidos.
- **Las reglas del guion:**
  - `rclone copy`, nunca `sync`;
  - solo copias terminadas;
  - **no purga si la copia local más reciente tiene más de 48 h o está dañada**: sube lo que
    haya y sale con error;
  - retención de 90 días, conservando siempre las 5 más recientes;
  - la edad sale del nombre del fichero, que vale en cualquier remoto;
  - deja `backups/.offsite-status.json`, que leerá el estado de la instancia (Bloque 4).
- **El humo puede apuntar a una instancia ya en marcha** (`E2E_BASE_URL` y `E2E_API_URL`).
  Funciona contra una base con datos: cada prueba crea su propio usuario y espacio, y ninguna
  necesita ser admin de instancia.
- **`RIUNA_DISABLE_SCHEDULER=true`** apaga todos los trabajos programados. Una copia trae las
  reglas, los stand-ups programados y los recordatorios de la instancia de verdad: con el
  planificador en marcha, mandaría mensajes reales a chats reales.
- **Simulacro sintético cada noche** (`restore-drill.yml`, también en las PR que tocan copias,
  imágenes o migraciones):
  1. construye las imágenes de `compose.local.yml`, siembra con `dev-seed.mjs` y copia;
  2. tira la instancia con su volumen y levanta un Postgres vacío;
  3. comprueba que un volcado truncado se rechaza sin crear nada;
  4. restaura y compara los recuentos (`scripts/backup/counts.sh`);
  5. levanta API y web sobre lo restaurado y pasa el humo entero contra ellas.

**Consecuencias.**

- **Las dos contraseñas del `crypt` hay que guardarlas fuera del PC.** Si se pierde el PC, se
  pierde con él `deploy/rclone/rclone.conf`, y sin ellas las copias de Drive son ilegibles.
  Está escrito en el procedimiento de montaje.
- Autorizar Drive necesita un navegador: se hace con `rclone authorize` en Windows y se pega
  el resultado en el contenedor.
- El simulacro nocturno tarda unos 20-30 minutos y no toca nada del PC.
- El simulacro real (`deploy/simulacro.sh`) llega en el Bloque 7, sobre estas mismas piezas.

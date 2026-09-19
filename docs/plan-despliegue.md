# Plan de despliegue personal de Riuna

> **Estado:** pendiente, guardado para más adelante (19-09-2026, revisado el
> 20-09-2026). Nada de esto está aplicado todavía: ni `compose.prod.yml` ni los
> scripts de `deploy/` existen. Adelanta parte de la
> [Fase 9](plan.md#fase-9--operación-2-semanas).

## Contexto

Riuna solo corre en local (`pnpm dev` + `compose.local.yml`). Quieres usarla tú solo, desde
varios sitios y dispositivos, sin pagar, y seguir desarrollándola en tu PC. Decisión ya tomada
en la conversación: **VM gratuita de Oracle Cloud (Always Free, ARM) + Tailscale**, sin puertos
abiertos a internet y sin dominio.

Lo que falta en el repo para que eso sea repetible y seguro:

- `compose.yml` expone Postgres en `5432` a todas las interfaces y apunta a
  `ghcr.io/kiim12m/riuna:latest`, una imagen que nunca se ha publicado (`docker.yml` no tiene
  ejecuciones y el repo es privado).
- No hay procedimiento de actualización. Las migraciones se aplican solas al arrancar
  (`runStartupTasks`, `apps/api/src/index.ts`; si fallan, el proceso sale con 1), así que una
  actualización sin copia previa arriesga los datos reales. **Solo el paso de drizzle va en una
  transacción**: `migrateWorkspaceUserEmail` y `migrateSessionColumn` corren antes, y
  `migrateApiKeyReferenceId`, `migrateNotificationPreferencesSchema`, `migrateGitHubIntegration`,
  `migrateColumns` y `seedDefaultWorkspaceRoles` después. Todas dan el mismo «❌ Database
  migration failed!», así que ese mensaje **no** significa que la base quedara intacta.
- Las copias viven en el mismo disco que la base (`docs/copias-de-seguridad.md`, «Lo que esto no
  cubre»). La Fase 9 del plan ya pide «copias fuera de la máquina y guía de actualización propia
  de Riuna»: este trabajo adelanta esa parte.

El plan tiene dos partes: **cambios en el repo** (los hago yo al aprobarlo) y un **runbook** que
ejecutas tú cuando quieras, y que queda escrito en `docs/despliegue.md`.

---

## Parte 1 — Cambios en el repo

### 1. `compose.prod.yml` (nuevo)

Basado en `compose.local.yml` y `compose.yml`:

- **Sin `name:` fijo.** El nombre del proyecto sale de `COMPOSE_PROJECT_NAME` en el `.env` de cada
  máquina (`riuna-prod` en la VM), y el de la imagen de `RIUNA_IMAGE` (`riuna` por defecto). Con un
  `name: riuna-prod` escrito en el fichero, cualquier copia del repo en el mismo host —la
  verificación de más abajo, sin ir más lejos— comparte proyecto, volumen y etiquetas con
  producción, y su `down -v` borra el volumen bueno. Con las dos variables, la verificación usa
  `riuna-verify` y no puede tocar nada de `riuna-prod`.
- `postgres`: igual que ahora, pero **sin `ports`**. Solo se alcanza por la red de Compose.
- `riuna`:
  - `image: ${RIUNA_IMAGE:-riuna}:current` con `pull_policy: never`. La imagen se construye en la
    máquina y no se descarga de ningún registro.
  - `ports: "127.0.0.1:${RIUNA_PORT:-5173}:5173"`. Tailscale publica desde localhost; con
    `RIUNA_PORT` se puede probar en tu PC sin chocar con Vite.
  - `environment: POSTGRES_HOST: postgres`.
  - El mismo healthcheck contra `/api/health`.
- `backup`: el servicio de `compose.local.yml` tal cual. Reutiliza `scripts/backup/backup.sh`, con
  `PGHOST: postgres` y `./backups` en el host.

### 2. Una orden `migrate` en la API (nueva)

Un punto de entrada que llama a `runStartupTasks()` y sale: 0 si todas las migraciones pasan,
distinto de 0 si no. Es lo que permite migrar **antes** de cambiar la imagen que sirve, y saber con
certeza si la base se tocó. Sin él, migrar y arrancar son el mismo acto y la respuesta a «¿se llegó
a migrar?» hay que buscarla en el log.

### 3. `deploy/actualizar.sh` (nuevo, POSIX `sh`, `set -eu`)

La única orden que se ejecuta en la VM para desplegar. El orden de los pasos importa:

1. Se sitúa en la raíz del repo y **se niega si el worktree no está limpio**: la VM no se edita a
   mano.
2. `git pull --ff-only`. El SHA que sirve **no se lee de git**: se lee de la imagen que está en
   marcha (`docker image inspect $RIUNA_IMAGE:current` y su etiqueta
   `org.opencontainers.image.revision`). Tras un despliegue fallido, `HEAD` y la imagen que sirve
   son distintos, y guardar `HEAD` antes del `pull` daba un objetivo de reversión que nunca llegó
   a desplegarse.
3. `docker build -f Dockerfile.riuna -t $RIUNA_IMAGE:<sha> --label org.opencontainers.image.revision=<sha> .`.
   Se construye primero, mientras la versión vieja sigue sirviendo.
4. **Copia de seguridad justo antes del cambio**, con
   `docker compose -f compose.prod.yml run --rm backup sh /scripts/backup.sh`, que funciona esté el
   servicio en marcha o parado —`exec` exige que lo esté, y un contenedor caído no puede
   distinguirse de una primera instalación—. Solo se salta, con aviso, si el volumen de Postgres
   todavía no existe. Si el volcado falla, el despliegue para: el script de copia ya distingue un
   volcado bueno de uno vacío.
5. **Migración con la imagen nueva, antes de cambiar nada**:
   `docker compose -f compose.prod.yml run --rm -e ... $RIUNA_IMAGE:<sha> migrate`.
   - Si falla, el script para aquí. La imagen vieja sigue sirviendo, pero **la base puede haber
     quedado a medias**: solo el paso de drizzle es transaccional. El script lo dice con esas
     palabras y recuerda que la copia del paso 4 es la salida.
   - Si pasa, la base ya está en el esquema nuevo y lo único que queda es el cambio de imagen.
6. `docker tag $RIUNA_IMAGE:<sha> $RIUNA_IMAGE:current` y
   `docker compose -f compose.prod.yml up -d --wait --wait-timeout 180`.
7. **Si el servicio arranca sano**: borra las imágenes `$RIUNA_IMAGE:*` salvo la actual y las dos
   anteriores, y ejecuta `docker builder prune -f --filter until=168h`. Así el disco no se llena
   con los meses. Solo se tocan las imágenes de ese nombre, no las de otra copia del repo.
8. **Si no arranca sano**: muestra las últimas líneas del log y **las órdenes exactas para
   revertir**, con el SHA leído en el paso 2 y el nombre del volcado del paso 4. No revierte solo.
   Como la migración ya pasó en el paso 5, volver a la imagen vieja la deja sobre un esquema nuevo:
   el script lo advierte y esa decisión la tomas tú, con la copia delante.

### 4. `deploy/copia-externa.sh` (nuevo)

Sube `./backups` a un remoto de rclone que recibe como argumento (recomendado: Google Drive a
través de un remoto `crypt` cifrado). Lo lanza el cron del host.

- **Se sitúa en la raíz del repo** (`cd "$(dirname "$0")/.."`), como `actualizar.sh`: el cron
  arranca en `$HOME` y `./backups` no es lo mismo desde ahí.
- Usa `rclone copy` y **no `sync`**: si `./backups` se vaciara por error, `sync` borraría también
  el remoto.
- Sube solo copias terminadas: `--include 'riuna_*.sql.gz'`, que deja fuera el `.partial` que el
  script de copia escribe mientras vuelca. Sin eso, una subida que caiga a la vez que un volcado
  se lleva un fichero truncado y lo conserva noventa días como si fuera bueno.
- **No purga a ciegas.** Antes de borrar nada comprueba que la copia local más reciente es de
  menos de dos días y que descomprime; si no, sube lo que haya, avisa y sale con código distinto
  de 0 **sin purgar**. Purgar por edad sola es lo que vacía el remoto cuando las copias dejan de
  llegar, que es justo cuando hace falta.
- La retención del remoto es más larga que la local y **siempre conserva las N más recientes**,
  tengan la edad que tengan, igual que `BACKUP_KEEP_MIN` en local:
  `OFFSITE_RETENTION_DAYS` (90 por defecto) y `OFFSITE_KEEP_MIN` (5).

### 5. `docs/despliegue.md` (nuevo): el runbook de la Parte 2

Con los comandos completos, la plantilla del `.env` de producción, cómo revertir, cómo probar una
restauración con `compose.prod.yml` (adaptando `docs/copias-de-seguridad.md`) y los planes B.

### 6. `docs/adr/035-despliegue-personal.md` (nuevo)

Sigue el formato de los ADR existentes:

- **Contexto**: uso personal desde varios sitios, coste cero, repo privado.
- **Decisión**:
  - Oracle Always Free + Tailscale.
  - Imagen construida en la VM y no en un registro.
  - Actualización con copia previa, migración en un paso aparte y sin reversión automática.
  - Copia externa con rclone.
- **Consecuencias**:
  - La VM compila, lo que tarda unos minutos.
  - Tailscale es necesario en cada dispositivo; `funnel` es la salida si alguno no lo admite.
  - Dependencia de las condiciones de Oracle.

### 7. Enlaces

- `docs/plan.md`: en la cabecera de «Complementarios», añadir el enlace a `despliegue.md`. En la
  Fase 9, una línea que diga que la guía de actualización y las copias externas ya están
  adelantadas.
- `docs/copias-de-seguridad.md`: «Copias fuera de la máquina» apunta a `copia-externa.sh`.

No se tocan `compose.yml` ni `compose.coolify.yml`: siguen siendo las variantes genéricas
heredadas.

---

## Parte 2 — Runbook (lo ejecutas tú; unas 2 h la primera vez)

**A. Cuentas**
1. **Oracle Cloud**:
   - Elige como región principal Madrid u otra cercana. No se puede cambiar después.
   - Pide tarjeta para verificar la cuenta.
   - Pasa la cuenta a **Pay As You Go** y crea una alerta de presupuesto de 1 €. Así Oracle no
     recupera la VM por inactividad y sigue costando 0 € mientras solo uses recursos Always Free.
2. **Tailscale**: plan personal gratuito. En el panel, activa **MagicDNS** y **HTTPS Certificates**.

**B. VM**
3. Crea una instancia `VM.Standard.A1.Flex` con 4 OCPU y 24 GB (el máximo gratuito), Ubuntu 24.04
   aarch64 y un volumen de arranque de 100 GB. Si aparece «Out of capacity», reintenta o cambia de
   dominio de disponibilidad. Si no hay manera, usa el plan B.
4. Instala Docker (`curl -fsSL https://get.docker.com | sh` y añade tu usuario al grupo `docker`).
   Instala Tailscale y ejecuta `sudo tailscale up --ssh`. Renombra la máquina a `riuna`.
5. **Antes de cerrar el puerto 22**, deja las dos salidas de emergencia listas:
   - En el panel de Tailscale, máquina `riuna` → **Disable key expiry**. Las claves caducan a los
     ~180 días: sin esto, medio año después la VM sale del tailnet y se lleva por delante el
     acceso web *y* el SSH a la vez.
   - `sudo passwd ubuntu` en la VM. La consola serie de Oracle pide usuario y contraseña, y las
     imágenes de Ubuntu vienen **sin contraseña**: una consola que solo enseña un `login:`
     imposible no es un rescate.
6. Con eso hecho y Tailscale SSH funcionando, **cierra el puerto 22** en la *security list* de
   Oracle.

**C. Primer arranque**
7. Crea una **deploy key** de solo lectura (`ssh-keygen -t ed25519`), añádela en GitHub
   (Settings → Deploy keys) y clona el repo por SSH en `~/riuna`.
8. Crea el `.env` en la VM. **No copies el de desarrollo** y **no pongas `DATABASE_URL`**:
   ```env
   COMPOSE_PROJECT_NAME=riuna-prod
   RIUNA_CLIENT_URL=https://riuna.<tu-tailnet>.ts.net
   AUTH_SECRET=<openssl rand -hex 32>
   POSTGRES_DB=riuna
   POSTGRES_USER=riuna
   POSTGRES_PASSWORD=<openssl rand -hex 24>
   DISABLE_REGISTRATION=true
   DISABLE_GUEST_ACCESS=true
   ```
   `POSTGRES_DB` y `POSTGRES_USER` se quedan en `riuna` porque el healthcheck de Postgres los da
   por hechos. Con `DISABLE_REGISTRATION` tu primer usuario entra igual y se convierte en admin de
   instancia (ADR 008).
9. Ejecuta `mkdir backups` (así el directorio es tuyo y no de root), luego
   `sh deploy/actualizar.sh` y después `tailscale serve --bg 5173`. La configuración de `serve`
   sobrevive a los reinicios.
10. Abre la URL y crea tu usuario.

**D. Dispositivos**
11. Instala Tailscale en cada dispositivo (Windows, móvil, portátil del trabajo si te dejan) con la
    misma cuenta y abre la URL.
    - Si algún dispositivo no admite Tailscale, cambia `serve` por `tailscale funnel --bg 5173`: la
      URL es la misma, pero pública.
    - Opcional: apunta el MCP de Claude Code a producción con
      `claude mcp add --transport http riuna-prod https://riuna.<tu-tailnet>.ts.net/api/mcp`.

**E. Copias externas**
12. Instala rclone en la VM y crea un remoto de Google Drive (con `rclone authorize` desde tu PC,
    que tiene navegador) y encima un remoto `crypt`. Google Drive y no el Object Storage de Oracle,
    porque la copia no debe depender de la misma cuenta que la VM.
13. En el cron, cada 6 h, con **ruta absoluta y `sh` delante**:
    `0 */6 * * * sh /home/ubuntu/riuna/deploy/copia-externa.sh gdrive-cifrado:riuna >> /home/ubuntu/copia-externa.log 2>&1`.
    El `sh` evita depender del bit de ejecución: este repo tiene `core.filemode=false` y los
    scripts están guardados como `100644`, así que un `deploy/copia-externa.sh` suelto daría
    «Permission denied» cada seis horas en un log que nadie mira. Al crear el script,
    `git update-index --chmod=+x deploy/copia-externa.sh` para que además llegue ejecutable.
14. Haz una prueba de restauración siguiendo `docs/despliegue.md`: restaura en
    `riuna_restore_test` y compara los recuentos. Anota la fecha, como ya se hace en
    `copias-de-seguridad.md`.

**F. Día a día**
- **Para desarrollar**: en tu PC, igual que ahora, y haces push a `main`.
- **Para desplegar**: `ssh ubuntu@riuna` y `cd riuna && sh deploy/actualizar.sh`. El usuario va
  delante: tu usuario de Windows no existe en la VM, y `ssh riuna` a secas lo usa como nombre de
  acceso. Una entrada `Host riuna` / `User ubuntu` en `~/.ssh/config` deja la orden corta.
- **Antes de desplegar una migración destructiva**: se ensaya **en la VM**, no en tu PC. Restaura
  la última copia en `riuna_restore_test` y corre contra ella el paso `migrate` de la imagen
  nueva (`POSTGRES_DB=riuna_restore_test`). Bajar un volcado de producción al portátil de
  desarrollo va contra la regla de `AGENTS.md` de no usar datos de producción para desarrollo, y
  además allí no reproduce ni la arquitectura ni la versión de Postgres de la VM. La regla de
  «restauración probada tras cualquier migración destructiva» está en la sección
  [Verificación](plan.md#verificación) del plan.

**Plan B** si Oracle no da capacidad: el mismo runbook en tu PC o en una Raspberry Pi. Los pasos
C a F son idénticos; la pega es que la máquina tiene que estar encendida.

---

## Verificación de la Parte 1 (en tu PC, antes de tocar la VM)

1. `docker compose -f compose.prod.yml config` sin errores y `sh -n deploy/*.sh`. También
   `shellcheck`, si está instalado.
2. **De punta a punta en un clon desechable dentro del scratchpad** (`git clone` del repo local;
   el commit de los ficheros nuevos se hace **solo dentro del clon**, no en tu repo). Su `.env` de
   prueba lleva `RIUNA_PORT=5180`, `RIUNA_CLIENT_URL=http://localhost:5180` y, sobre todo,
   `COMPOSE_PROJECT_NAME=riuna-verify` y `RIUNA_IMAGE=riuna-verify`: con eso, ni el `down -v` ni
   la purga de imágenes pueden alcanzar nada de `riuna-prod`.
   - Primera ejecución de `actualizar.sh`: construye, se salta la copia, migra, arranca y
     `--wait` sale sano.
   - En `http://localhost:5180`: crear usuario, proyecto y tarea.
   - **Un commit de relleno en el origen del clon** (cambiar una línea de un README y
     `git commit`) antes de la segunda vuelta: sin un SHA nuevo, la segunda ejecución construye
     la misma imagen, Compose no recrea nada y no se prueba ni el cambio de imagen, ni la purga,
     ni las órdenes de reversión, que es justo lo que esa vuelta existe para probar.
   - Segunda ejecución: hace la copia, migra, cambia de imagen, sale sano y limpia las imágenes
     viejas.
   - Restauración en `riuna_restore_test`: los recuentos de `task`, `activity` y `project`
     coinciden.
   - Un volcado truncado a mano: `restore.sh` lo rechaza **sin tocar** la base de destino.
   - `copia-externa.sh` contra una ruta local como remoto, si rclone está disponible en Windows.
     Si no, queda para la VM.
   - Limpieza: `docker compose -f compose.prod.yml down -v` **dentro del clon**, que con
     `COMPOSE_PROJECT_NAME=riuna-verify` solo borra sus propios volúmenes.
3. **Lo que no se puede probar aquí**: la compilación en ARM (el Dockerfile la da por
   independiente de arquitectura; la primera compilación en la VM es la prueba), Tailscale y
   Oracle. Quedan como puntos de control del runbook.

## Fuera de alcance

- Publicar la imagen en ghcr y el despliegue automático desde GitHub Actions. Tendría sentido si
  compilar en la VM llegara a molestar.
- Redis, S3/R2, SMTP y Cloudflare.
- El resto de la Fase 9: métricas, logs estructurados y humo contra producción.

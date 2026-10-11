# Actualizar la instancia

La instancia corre en el PC con Docker Desktop y se entra por Tailscale
([ADR 071](adr/071-la-instancia-del-pc-por-tailscale.md)). Desplegar es reconstruir dos
imágenes desde la fuente y recrear sus contenedores. Lo único que pide cuidado son las
migraciones, y de eso se encarga `deploy/actualizar.sh`.

## Cómo está montado

La instancia corre con **`compose.local.yml`**, no con `compose.yml`. Son cuatro servicios
bajo el proyecto `riuna`:

| Servicio | Contenedor | Qué es |
|---|---|---|
| `postgres` | `riuna-postgres-1` | La base. Publica el **5433** (el 5432 lo ocupa otro proyecto) |
| `backup` | `riuna-backup-1` | Copias automáticas a `./backups` (ver [copias de seguridad](copias-de-seguridad.md)) |
| `api` | `riuna-api-1` | Se construye desde `apps/api/Dockerfile`. Publica el 1337 |
| `web` | `riuna-web-1` | Se construye desde `apps/web/Dockerfile`. Publica el 5173 |

**Los tres puertos escuchan solo en `127.0.0.1`.** Desde fuera del PC se entra por
`tailscale serve` (abajo). `RIUNA_BIND_ADDRESS=0.0.0.0` en el `.env` los vuelve a abrir a la
red local, pero no hace falta para nada.

Las imágenes `riuna-api` y `riuna-web` **se construyen en la máquina**; no salen de ningún
registro. Cada una lleva en la etiqueta `org.opencontainers.image.revision` el commit con el
que se construyó.

Al lado de todo esto puede correr un **entorno de desarrollo en paralelo**, con
`pnpm dev:parallel`: otros puertos (5273 y 1437) y la base local, para ver un cambio antes de
reconstruir las imágenes. No toca nada de lo de arriba; está en
[entorno-desarrollo.md](entorno-desarrollo.md).

> **`compose.yml` no sirve para esto.** Es la variante genérica heredada y apunta a
> `ghcr.io/kiim12m/riuna:latest`, una imagen que nunca se ha publicado. Como es el fichero
> que Docker coge por defecto, olvidar el `-f compose.local.yml` da un error que no se parece
> en nada a su causa. Más abajo está cómo quitarse ese riesgo de encima.

## Cómo se entra: `tailscale serve`

Una sola URL con HTTPS, `https://<pc>.<tailnet>.ts.net`, para la web y para la API:

```bash
tailscale serve --bg http://127.0.0.1:5173
tailscale serve --bg --set-path /api http://127.0.0.1:1337/api
tailscale serve status
```

- **El destino de la API repite `/api`.** `serve` quita el prefijo del montaje antes de
  reenviar y le añade la ruta del destino. Sin repetirlo, la API recibiría `/auth/...` en vez
  de `/api/auth/...`.
- **Desde Git Bash, con `MSYS_NO_PATHCONV=1` delante**, o desde PowerShell. Si no, Git Bash
  convierte `/api` en `C:/Program Files/Git/api`.
- `--bg` hace que la configuración sobreviva a los reinicios del PC y de Tailscale.

En el `.env`:

```env
RIUNA_CLIENT_URL=https://<pc>.<tailnet>.ts.net
RIUNA_API_URL=https://<pc>.<tailnet>.ts.net/api
```

Si el `.env` define `CORS_ORIGINS`, tiene que incluir la URL nueva.

### Pasar de la IP y los puertos a `tailscale serve` (una sola vez)

Hasta la Fase 9 se entraba por `http://100.x.x.x:5173`. **El orden importa:** la primera
actualización con `deploy/actualizar.sh` cierra los puertos a `127.0.0.1`. Si se hace antes de
montar `serve`, deja fuera a todo el que entraba por la IP.

1. En el [panel de Tailscale](https://login.tailscale.com/admin/dns), activa **MagicDNS** y
   **HTTPS Certificates**. En la máquina del PC, **Disable key expiry**: las claves caducan a
   los ~180 días y el PC saldría del tailnet sin avisar.
2. Lanza las dos órdenes `tailscale serve` de arriba y cambia las dos URL del `.env`.
3. `docker compose -f compose.local.yml up -d`, que recrea `api` y `web` con las URL nuevas.
4. Abre `https://<pc>.<tailnet>.ts.net`, entra y comprueba que el tablero se actualiza solo
   (WebSocket). Hazlo también desde el móvil, con Tailscale activo.
5. Ya puedes actualizar con el guion.

Lo que cambia de dirección con la URL nueva:

- **los calendarios suscritos** (ADR 057): hay que volver a suscribirlos con el enlace que da
  ahora la pantalla. Un calendario de Google o de Outlook en la nube no llega nunca a un
  tailnet; el del móvil con Tailscale activo, sí;
- **el MCP de Claude Code**: `https://<pc>.<tailnet>.ts.net/api/mcp`;
- **los webhooks de GitHub o Gitea**, si los hubiera: tampoco llegan a un tailnet.

## La actualización habitual

Desde la raíz del repositorio, en Git Bash:

```bash
sh deploy/actualizar.sh
```

Y en el navegador, **Ctrl+Shift+R**: sin eso se queda con el bundle anterior en caché y
parece que no ha cambiado nada.

Qué hace, en este orden:

1. **Se niega si hay cambios sin commitear.** La instancia no se edita a mano.
2. `git pull --ff-only`. Si la imagen que sirve ya es de ese commit, dice que no hay nada que
   hacer y sale.
3. **Construye** `api` y `web` mientras la versión vieja sigue sirviendo.
4. **Hace una copia** justo antes de tocar nada. Si falla, para sin haber tocado nada.
5. **Migra con la imagen nueva** (`node dist/migrate.js`) antes de cambiar la que sirve.
6. **Levanta** las imágenes nuevas y espera a que la API esté sana.
7. Si algo falla, **imprime cómo volver atrás**, con el commit que servía y el nombre de la
   copia. No revierte solo.

Dos cosas que ahorran disgustos:

- **Nada de `--no-cache` por rutina.** La caché de Docker se invalida sola cuando cambia el
  código, y saltársela cuesta varios minutos cada vez.
- **Se reconstruyen los dos servicios.** Se podría afinar —`api` para `apps/api`, `web` para
  `apps/web`—, pero `i18n`, `packages/libs` y `packages/permissions` alimentan a ambos.

### Si falla la migración

La versión vieja sigue sirviendo, pero **la base puede haber quedado a medias**: solo el paso
de drizzle va en una transacción. Las demás migraciones de arranque (`migrateApiKeyReferenceId`,
`migrateColumns`, `seedDefaultWorkspaceRoles`…) corren fuera. El guion imprime cómo restaurar la
copia de hace un momento. Antes de hacerlo, lee el error.

### Si no arranca sana

Imprime el final del log de la API y las órdenes para volver al commit que servía. **Si esa
actualización aplicó migraciones, lo dice**: volver a la imagen vieja la deja sobre un esquema
que no es el suyo, y la salida fiable es la copia.

### A mano, sin el guion

Lo mismo, paso a paso:

```bash
export MSYS_NO_PATHCONV=1                       # solo en Git Bash
git pull --ff-only
RIUNA_REVISION=$(git rev-parse HEAD) docker compose -f compose.local.yml build api web
docker compose -f compose.local.yml run --rm -T --entrypoint /bin/sh backup /scripts/backup.sh
docker compose -f compose.local.yml run --rm -T --no-deps api node dist/migrate.js
docker compose -f compose.local.yml up -d --wait
```

Si quieres saber de antemano si lo que vas a traerte toca migraciones:

```bash
git fetch
git log --oneline HEAD..origin/main -- apps/api/drizzle/
```

## La zona horaria (ADR 049)

La API corre en `Europe/Madrid` (`ENV TZ` en su imagen) y PostgreSQL en UTC.
**No pongas `TZ` en el `.env`.** `compose.local.yml` también se lo pasa al
contenedor de Postgres, que tiene que seguir en UTC; si no lo está, la API lo
avisa al arrancar.

La conversión de los días del plan que se guardaron antes del cambio ya está
aplicada en producción y su código se retiró. Está contada en la ADR 049.

## Comprobar que fue bien

```bash
docker compose -f compose.local.yml ps
```

`riuna-api-1` y `riuna-web-1` en `Up`. Si alguno aparece como `Restarting`, el
motivo está en su log:

```bash
docker compose -f compose.local.yml logs --tail=40 api
```

La API escribe **una línea JSON por suceso** ([ADR 073](adr/073-logs-estructurados.md)): una
por petición, con su ruta, su estado y lo que tardó, y cualquier error con su pila. Para
leerlo a ojo, pon `LOG_FORMAT=pretty` en el `.env` y vuelve a levantar `api`. Cada respuesta
lleva una cabecera `X-Request-Id`, y todas las líneas de esa petición llevan el mismo
`requestId`: es lo que hay que buscar cuando algo falla en el navegador.

## Quitarte el `-f` de encima

Añade esta línea a tu `.env` (está en `.gitignore`, así que es solo de esta
máquina):

```env
COMPOSE_FILE=compose.local.yml
```

Con eso, `docker compose build` y `docker compose up -d` a secas ya hacen lo
correcto, y desaparece la trampa de `compose.yml`.

## Si la API se reinicia en bucle

El síntoma que ve el navegador es siempre el mismo —«NetworkError»— porque nginx
se queda sin nada a lo que hacer de proxy, así que hay que mirar el log de `api`.

Un caso que ya ocurrió, por si reaparece: `ERR_MODULE_NOT_FOUND` sobre
`@riuna/email/dist/index.js`. `packages/email` compila con `incremental: true`,
y si su `.cache/tsbuildinfo.json` entra en el contexto de construcción sin su
`dist`, `tsc` da todo por emitido, sale con código 0 y no genera nada: la imagen
se construye sin errores y no arranca. Está resuelto excluyendo `**/.cache` en
`.dockerignore`; si algún día vuelve a pasar, es que esa exclusión se perdió.

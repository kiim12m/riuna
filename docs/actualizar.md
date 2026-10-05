# Actualizar la instancia

Desplegar aquí es reconstruir dos imágenes desde la fuente y recrear sus
contenedores. Lo único que pide cuidado son las migraciones, porque se aplican
solas al arrancar.

## Cómo está montado

La instancia corre con **`compose.local.yml`**, no con `compose.yml`. Son cuatro
servicios bajo el proyecto `riuna`:

| Servicio | Contenedor | Qué es |
|---|---|---|
| `postgres` | `riuna-postgres-1` | La base. Publica el **5433** en el host, porque el 5432 lo ocupa otro proyecto |
| `backup` | `riuna-backup-1` | Copias automáticas a `./backups` (ver [copias de seguridad](copias-de-seguridad.md)) |
| `api` | `riuna-api-1` | Se construye desde `apps/api/Dockerfile`. Publica el 1337 |
| `web` | `riuna-web-1` | Se construye desde `apps/web/Dockerfile`. Publica el 5173 |

Las imágenes `riuna-api` y `riuna-web` **se construyen en la máquina**; no salen
de ningún registro.

Al lado de todo esto puede correr un **entorno de desarrollo en paralelo**, con
`pnpm dev:parallel`: otros puertos (5273 y 1437) y la base local, para ver un
cambio antes de reconstruir las imágenes. No toca nada de lo de arriba; está en
[entorno-desarrollo.md](entorno-desarrollo.md).

> **`compose.yml` no sirve para esto.** Es la variante genérica heredada y apunta
> a `ghcr.io/kiim12m/riuna:latest`, una imagen que nunca se ha publicado. Como es
> el fichero que Docker coge por defecto, olvidar el `-f compose.local.yml` da un
> error que no se parece en nada a su causa. Más abajo está cómo quitarse ese
> riesgo de encima.

## La actualización habitual

```bash
cd ~/Documents/GitHub/riuna
git pull --ff-only
docker compose -f compose.local.yml build api web
docker compose -f compose.local.yml up -d
```

Y en el navegador, **Ctrl+Shift+R**: sin eso se queda con el bundle anterior en
caché y parece que no ha cambiado nada.

Dos cosas que ahorran disgustos:

- **Nada de `--no-cache` por rutina.** La caché de Docker se invalida sola cuando
  cambia el código, y saltársela cuesta varios minutos cada vez. Resérvalo para
  cuando sospeches que una capa quedó mal.
- **Reconstruye los dos servicios.** Se podría afinar —`api` para `apps/api`,
  `web` para `apps/web`—, pero `i18n`, `packages/libs` y `packages/permissions`
  alimentan a ambos. Acertar cuesta más atención que reconstruir de más.

## Cuando el cambio trae migraciones

Es lo único delicado. La API ejecuta `runStartupTasks()` al arrancar y migra
sola, y **solo el paso de drizzle va en una transacción**: si falla, la base
puede quedar a medias (el detalle está en
[plan-despliegue.md](plan-despliegue.md)).

Mira si lo que vas a traerte toca migraciones:

```bash
git fetch
git log --oneline HEAD..origin/main -- apps/api/drizzle/
```

Si devuelve algo, fuerza una copia antes de reconstruir y comprueba que pesa:

```bash
docker compose -f compose.local.yml exec backup sh /scripts/backup.sh
ls -lh backups/ | tail -3
```

El servicio `backup` ya hace copias periódicas, pero antes de migrar interesa una
recién hecha, no la de hace veinte horas.

### La zona horaria (ADR 049)

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

## Volver atrás

Como las imágenes se construyen de la fuente, lo fiable es volver por git y
reconstruir:

```bash
git checkout <sha-anterior>
docker compose -f compose.local.yml build api web
docker compose -f compose.local.yml up -d
```

Tarda unos minutos, pero no depende de haber etiquetado la imagen antigua antes
de machacarla, que es justo lo que no se suele recordar hacer.

**Si la actualización llegó a migrar la base, esto no basta**: volver a una
imagen anterior la deja corriendo sobre un esquema nuevo. Ahí la salida es la
copia, no el `git checkout`.

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

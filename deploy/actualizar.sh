#!/bin/sh
# Actualiza la instancia del PC (compose.local.yml) a lo que haya en la rama.
#
#   sh deploy/actualizar.sh
#
# El orden es lo que importa (ADR 071):
#   1. se niega con el worktree sucio: lo que sirve tiene que estar en git;
#   2. trae la rama con --ff-only;
#   3. construye las imagenes nuevas mientras la version vieja sigue sirviendo;
#   4. hace una copia justo antes de tocar nada; si falla, para;
#   5. migra con la imagen nueva **antes** de cambiar la que sirve;
#   6. levanta las imagenes nuevas y espera a que la API este sana;
#   7. si algo falla, imprime como volver atras. No revierte solo: con la base
#      ya migrada, volver a la imagen vieja es una decision que hay que tomar
#      con la copia delante.
#
# Corre en Git Bash, en WSL o en Linux.
set -eu

# Git Bash convierte cualquier argumento que empiece por / en una ruta de
# Windows antes de que lo vea docker: /scripts/backup.sh llegaba al contenedor
# como C:/Program Files/Git/scripts/backup.sh.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

compose() {
  docker compose -f compose.local.yml "$@"
}

say() {
  printf '\n[actualizar] %s\n' "$*"
}

fail() {
  printf '\n[actualizar] ERROR: %s\n' "$*" >&2
  exit 1
}

# Cuantas migraciones de drizzle tiene aplicadas la base. Se pregunta dentro del
# contenedor, que ya tiene POSTGRES_USER y POSTGRES_DB del .env.
applied_migrations() {
  # shellcheck disable=SC2016 # las variables se expanden dentro del contenedor
  compose exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null || echo 0' \
    | tr -d '[:space:]'
}

# El commit con el que se construyo la imagen que sirve ahora. Se lee de la
# imagen y no de git: tras un despliegue fallido, HEAD y lo que sirve no son lo
# mismo, y volver a HEAD seria volver a algo que nunca llego a arrancar.
serving_revision() {
  image=$(compose images -q api 2>/dev/null | head -n 1)
  if [ -n "$image" ]; then
    docker image inspect --format \
      '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
      "$image" 2>/dev/null || true
  fi
}

# La copia mas reciente. Los nombres llevan la fecha, y el glob sale ordenado.
latest_backup() {
  last=""
  for file in backups/riuna_*.sql.gz; do
    [ -e "$file" ] && last="$file"
  done
  printf '%s' "$last"
}

# --- 1. worktree limpio -------------------------------------------------------
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  fail "hay cambios sin commitear. La instancia no se edita a mano: commitea o descarta y vuelve a lanzarlo."
fi

previous=$(serving_revision)
case "$previous" in
  "" | "<no value>") previous="" ;;
esac

# --- 2. traer la rama ----------------------------------------------------------
branch=$(git rev-parse --abbrev-ref HEAD)
say "trayendo $branch con --ff-only"
git pull --ff-only
target=$(git rev-parse HEAD)
short=$(git rev-parse --short HEAD)

if [ -n "$previous" ] && [ "$previous" = "$target" ]; then
  say "la instancia ya sirve $short: nada que hacer"
  exit 0
fi

# --- 3. construir mientras sirve la version vieja -----------------------------
say "construyendo api y web en $short (la version actual sigue sirviendo)"
if ! RIUNA_REVISION="$target" compose build api web; then
  fail "la construccion ha fallado. No se ha tocado nada: la version actual sigue sirviendo."
fi

# --- 4. copia justo antes del cambio ------------------------------------------
# `run` y no `exec`: funciona tambien con el servicio de copias parado. El
# entrypoint del servicio es el bucle periodico, asi que se sustituye. `-T`
# porque Git Bash (mintty) no es una terminal para Docker: pedir un TTY falla
# con «the input device is not a TTY».
say "copia de seguridad previa"
before_copy=$(latest_backup)
if ! compose run --rm -T --entrypoint /bin/sh backup /scripts/backup.sh; then
  fail "la copia previa ha fallado. No se ha tocado nada: la version actual sigue sirviendo."
fi
backup=$(latest_backup)
if [ -z "$backup" ] || [ "$backup" = "$before_copy" ]; then
  fail "no aparece la copia nueva en backups/. No se ha tocado nada."
fi
say "copia lista: $backup"

# --- 5. migrar con la imagen nueva --------------------------------------------
applied_before=$(applied_migrations)
say "migrando con la imagen nueva"
if ! compose run --rm -T --no-deps api node dist/migrate.js; then
  cat >&2 <<EOF

[actualizar] ERROR: la migracion ha fallado.

La version anterior sigue sirviendo, pero la base PUEDE HABER QUEDADO A MEDIAS:
solo el paso de drizzle es transaccional. Mira el error de arriba antes de nada.
Si hay que volver al estado previo, la salida es la copia de hace un momento:

  docker compose -f compose.local.yml stop api
  docker compose -f compose.local.yml exec backup sh /scripts/restore.sh /$backup
  docker compose -f compose.local.yml start api

(docs/copias-de-seguridad.md, «Restaurar de verdad»)
EOF
  exit 1
fi
applied_after=$(applied_migrations)

# --- 6. cambiar de imagen ------------------------------------------------------
say "levantando $short"
if compose up -d --wait --wait-timeout 180; then
  # Solo las capas huerfanas de este proyecto, no las de cualquier otro.
  project=$(compose config 2>/dev/null | sed -n 's/^name: *//p' | head -n 1)
  if [ -n "$project" ]; then
    docker image prune -f --filter "label=com.docker.compose.project=$project" >/dev/null || true
  fi
  say "listo: la instancia sirve $short. En el navegador, Ctrl+Shift+R."
  exit 0
fi

# --- 7. no arranca sana --------------------------------------------------------
compose logs --tail=40 api >&2 || true

if [ -n "$previous" ]; then
  back="$previous"
else
  back="<commit anterior: mira git log>"
fi

cat >&2 <<EOF

[actualizar] ERROR: $short no ha arrancado sana. Arriba, el final del log de la API.

Para volver a la version que servia antes:

  git checkout $back
  RIUNA_REVISION=$back docker compose -f compose.local.yml build api web
  docker compose -f compose.local.yml up -d

Eso deja git fuera de la rama. Cuando el arreglo este en ella, vuelve con
'git checkout $branch' antes de relanzar este guion.

EOF

if [ "$applied_before" != "$applied_after" ]; then
  cat >&2 <<EOF
OJO: esta actualizacion aplico migraciones ($applied_before -> $applied_after). La version
anterior arrancaria sobre un esquema que no es el suyo. Si no arranca o se
comporta raro, restaura la copia previa ($backup) siguiendo
docs/copias-de-seguridad.md, «Restaurar de verdad».
EOF
else
  echo "Esta actualizacion no aplico migraciones: volver atras no toca la base." >&2
fi
exit 1

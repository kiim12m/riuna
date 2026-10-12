#!/bin/sh
# Simulacro de restauracion con una copia real, en el PC (ADR 072).
#
#   sh deploy/simulacro.sh [copia.sql.gz]          restaura y arranca, para mirarlo
#   sh deploy/simulacro.sh --humo [copia.sql.gz]   restaura, arranca y pasa el humo
#   sh deploy/simulacro.sh --down                  lo tira todo
#
# Sin copia, usa la mas reciente de ./backups.
#
# Corre en un proyecto Compose aparte (riuna-simulacro), con su volumen, su
# .env generado, su directorio de copias y sus puertos (web 5183, API 1347,
# solo en 127.0.0.1). No toca la instancia de verdad, ni su .env, ni ./backups.
#
# Y nada de lo restaurado puede salir:
#   - sin planificador: ni stand-ups ni recordatorios a chats de verdad;
#   - sin correo: el .env del simulacro no lleva SMTP;
#   - con una clave de cifrado nueva: los destinos de chat y webhook
#     restaurados no se pueden descifrar;
#   - sin limites de tasa, porque el humo se registra muchas veces seguidas.
#
# La copia real se queda en esta maquina: AGENTS.md no deja bajarla a
# desarrollo, y el simulacro no lo hace.
set -eu

# Git Bash convierte las rutas que empiezan por / antes de que las vea Docker.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

PROJECT=riuna-simulacro
DIR=deploy/.simulacro
ENV_FILE=$DIR/simulacro.env

say() {
  printf '\n[simulacro] %s\n' "$*"
}

fail() {
  printf '\n[simulacro] ERROR: %s\n' "$*" >&2
  exit 1
}

drill() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" \
    -f compose.local.yml -f deploy/simulacro.compose.yml "$@"
}

if [ "${1:-}" = "--down" ]; then
  if [ -f "$ENV_FILE" ]; then
    drill --profile smoke down -v --remove-orphans
  fi
  # Lo que escribio el contenedor del humo puede ser de root en Linux.
  rm -rf "$DIR" 2>/dev/null \
    || say "no se pudo borrar $DIR entero: borralo a mano"
  say "simulacro borrado: contenedores y volumen"
  exit 0
fi

smoke=false
dump=""
for arg in "$@"; do
  case "$arg" in
    --humo) smoke=true ;;
    -*) fail "opcion desconocida: $arg" ;;
    *) dump=$arg ;;
  esac
done

if [ -z "$dump" ]; then
  for file in backups/riuna_*.sql.gz; do
    [ -e "$file" ] && dump=$file
  done
fi
[ -n "$dump" ] || fail "no hay ninguna copia en backups/; pasa una"
[ -f "$dump" ] || fail "no existe la copia: $dump"
name=$(basename "$dump")

# Las imagenes que ya sirven: el simulacro no construye nada.
for image in riuna-api riuna-web; do
  docker image inspect "$image" >/dev/null 2>&1 \
    || fail "no esta la imagen $image: actualiza primero con deploy/actualizar.sh"
done

# --- un entorno propio ---------------------------------------------------------
secret() {
  od -An -tx1 -N24 /dev/urandom | tr -d ' \n'
}

mkdir -p "$DIR/backups"
cp "$dump" "$DIR/backups/$name"
{
  echo "RIUNA_ENV_FILE=$ENV_FILE"
  echo "RIUNA_BACKUP_DIR=./$DIR/backups"
  echo "RIUNA_BIND_ADDRESS=127.0.0.1"
  echo "RIUNA_DB_PORT=5443"
  echo "RIUNA_API_PORT=1347"
  echo "RIUNA_WEB_PORT=5183"
  # El healthcheck de compose.local.yml da por hechos usuario y base `riuna`.
  echo "POSTGRES_DB=riuna"
  echo "POSTGRES_USER=riuna"
  echo "POSTGRES_PASSWORD=$(secret)"
  echo "AUTH_SECRET=$(secret)$(secret)"
  echo "NOTIFICATION_SECRET_ENCRYPTION_KEY=$(secret)$(secret)"
  # Las de localhost, tanto para mirarlo en el navegador del PC como para el
  # humo, que las alcanza por deploy/simulacro-proxy.mjs.
  echo "RIUNA_CLIENT_URL=http://localhost:5183"
  echo "RIUNA_API_URL=http://localhost:1347"
  echo "DISABLE_REGISTRATION=false"
  echo "RIUNA_DISABLE_SCHEDULER=true"
  echo "RATE_LIMIT_ENABLED=false"
} > "$ENV_FILE"

# --- restaurar en limpio --------------------------------------------------------
say "levantando un Postgres vacio en el proyecto $PROJECT"
drill down -v --remove-orphans >/dev/null 2>&1 || true
drill up -d --wait postgres

say "restaurando $name"
drill run --rm -T --entrypoint /bin/sh backup /scripts/restore.sh "/backups/$name"

say "recuentos: la instancia de verdad (ahora) y la copia restaurada"
docker compose -f compose.local.yml run --rm -T --entrypoint /bin/sh backup \
  /scripts/counts.sh > "$DIR/recuentos-instancia.txt"
drill run --rm -T --entrypoint /bin/sh backup /scripts/counts.sh \
  > "$DIR/recuentos-copia.txt"
printf '\n%-14s %10s %10s\n' tabla instancia copia
# Las dos salen de la misma consulta, ordenadas igual: se leen en paralelo.
paste -d ' ' "$DIR/recuentos-instancia.txt" "$DIR/recuentos-copia.txt" \
  | while read -r table live _ restored; do
    printf '%-14s %10s %10s\n' "$table" "$live" "$restored"
  done
echo "(lo que difiera es lo que ha pasado desde que se hizo la copia)"

# --- arrancar sobre lo restaurado ---------------------------------------------
say "arrancando la API y la web sobre la copia, con las imagenes que ya sirven"
drill up -d --no-build --wait api web

if [ "$smoke" = false ]; then
  cat <<EOT

[simulacro] listo. Abre http://localhost:5183 y entra con tu cuenta: tiene que
estar todo lo que habia cuando se hizo la copia.

Para pasar el humo entero contra ella:   sh deploy/simulacro.sh --humo
Para tirarlo:                            sh deploy/simulacro.sh --down
EOT
  exit 0
fi

say "pasando el humo entero (instala dependencias la primera vez: unos minutos)"
if drill --profile smoke run --rm smoke; then
  say "el humo pasa contra la copia restaurada: el criterio de la Fase 9 se cumple"
  echo "Apunta la fecha y los recuentos en docs/copias-de-seguridad.md, y tira el"
  echo "simulacro con: sh deploy/simulacro.sh --down"
else
  fail "el humo ha fallado contra la copia. Las trazas estan en $DIR/test-results, y
el simulacro sigue en marcha en http://localhost:5183 para mirarlo."
fi

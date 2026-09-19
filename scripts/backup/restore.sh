#!/bin/sh
# Restaura un volcado de Riuna.
#
#   sh restore.sh /backups/riuna_2026-08-23_030000.sql.gz [base_destino]
#
# Sin base de destino restaura sobre POSTGRES_DB, **borrando su contenido**.
# Con base de destino la crea y restaura ahi, que es como se prueba una copia
# sin tocar los datos reales.
set -eu

dump="${1:?uso: restore.sh <fichero.sql.gz> [base_destino]}"
target_db="${2:-$POSTGRES_DB}"
PGHOST="${PGHOST:-postgres}"

export PGPASSWORD="$POSTGRES_PASSWORD"

if [ ! -f "$dump" ]; then
  echo "[restore] no existe el fichero: $dump" >&2
  exit 1
fi

psql_admin() {
  psql --host="$PGHOST" --username="$POSTGRES_USER" --dbname=postgres \
    --quiet --no-psqlrc --command="$1"
}

if [ "$target_db" = "$POSTGRES_DB" ]; then
  echo "[restore] ATENCION: se va a sobrescribir la base real '$target_db'"
fi

echo "[restore] recreando $target_db"
psql_admin "DROP DATABASE IF EXISTS \"$target_db\" WITH (FORCE);"
psql_admin "CREATE DATABASE \"$target_db\" OWNER \"$POSTGRES_USER\";"

echo "[restore] cargando $dump"
# ON_ERROR_STOP hace que un volcado corrupto falle aqui, en vez de dejar una
# base a medias que parece restaurada.
gunzip -c "$dump" | psql --host="$PGHOST" --username="$POSTGRES_USER" \
  --dbname="$target_db" --quiet --no-psqlrc \
  --set ON_ERROR_STOP=1

echo "[restore] listo: $target_db"

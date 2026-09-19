#!/bin/sh
# Restaura un volcado de Riuna.
#
#   sh restore.sh /backups/riuna_2026-08-23_030000.sql.gz [base_destino]
#
# Sin base de destino restaura sobre POSTGRES_DB, **borrando su contenido**.
# Con base de destino la crea y restaura ahi, que es como se prueba una copia
# sin tocar los datos reales.
set -eu
# Sin esto, `gunzip | psql` devuelve el estado de psql: un gzip danado se
# quedaba en una base a medias con el script diciendo que habia ido bien.
set -o pipefail

dump="${1:?uso: restore.sh <fichero.sql.gz> [base_destino]}"
target_db="${2:-$POSTGRES_DB}"
staging_db="${target_db}__restoring"
PGHOST="${PGHOST:-postgres}"

export PGPASSWORD="$POSTGRES_PASSWORD"

if [ ! -f "$dump" ]; then
  echo "[restore] no existe el fichero: $dump" >&2
  exit 1
fi

# El fichero se comprueba **antes** de tocar ninguna base: un gzip danado o un
# volcado cortado no pueden llegar a borrar la base de destino. pg_dump en
# formato plano termina siempre con esta linea.
footer=$(gunzip -c "$dump" | tail -n 10) || footer=""
case "$footer" in
  *"PostgreSQL database dump complete"*) ;;
  *)
    echo "[restore] el volcado esta danado o incompleto: $dump" >&2
    exit 1
    ;;
esac

psql_admin() {
  psql --host="$PGHOST" --username="$POSTGRES_USER" --dbname=postgres \
    --quiet --no-psqlrc --command="$1"
}

if [ "$target_db" = "$POSTGRES_DB" ]; then
  echo "[restore] ATENCION: se va a sobrescribir la base real '$target_db'"
fi

# Se carga en una base aparte y solo al final se cambia por la de destino: si
# la carga falla a medias, la base de destino sigue exactamente como estaba.
echo "[restore] cargando $dump en $staging_db"
psql_admin "DROP DATABASE IF EXISTS \"$staging_db\" WITH (FORCE);"
psql_admin "CREATE DATABASE \"$staging_db\" OWNER \"$POSTGRES_USER\";"

# ON_ERROR_STOP hace que un error de SQL corte aqui en vez de seguir cargando.
if ! gunzip -c "$dump" | psql --host="$PGHOST" --username="$POSTGRES_USER" \
  --dbname="$staging_db" --quiet --no-psqlrc --set ON_ERROR_STOP=1; then
  psql_admin "DROP DATABASE IF EXISTS \"$staging_db\" WITH (FORCE);"
  echo "[restore] la carga ha fallado: $target_db no se ha tocado" >&2
  exit 1
fi

echo "[restore] sustituyendo $target_db"
psql_admin "DROP DATABASE IF EXISTS \"$target_db\" WITH (FORCE);"
psql_admin "ALTER DATABASE \"$staging_db\" RENAME TO \"$target_db\";"

echo "[restore] listo: $target_db"

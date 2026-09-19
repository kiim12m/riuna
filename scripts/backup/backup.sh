#!/bin/sh
# Copia de seguridad de la base de datos de Riuna.
#
# Pensado para correr dentro del servicio `backup` de compose.local.yml, que
# usa la misma imagen de Postgres que el servidor: asi la version de pg_dump
# siempre coincide con la del servidor y no hay una dependencia mas que operar.
#
# Variables (las aporta el .env compartido):
#   POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
#   BACKUP_DIR            destino de los volcados      (por defecto /backups)
#   BACKUP_RETENTION_DAYS dias que se conservan        (por defecto 14)
#   BACKUP_KEEP_MIN       copias que nunca se purgan   (por defecto 3)
#   BACKUP_INTERVAL_HOURS periodo entre copias         (por defecto 24)
set -eu
# Sin esto, `pg_dump | gzip` devuelve el estado de gzip: un pg_dump que no
# llegaba a conectar dejaba un gzip vacio de 20 bytes con nombre de copia buena.
set -o pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_KEEP_MIN="${BACKUP_KEEP_MIN:-3}"
PGHOST="${PGHOST:-postgres}"

export PGPASSWORD="$POSTGRES_PASSWORD"

mkdir -p "$BACKUP_DIR"

# Al reiniciarse Docker, este contenedor y Postgres arrancan a la vez y
# `depends_on` no espera a nadie: el volcado llegaba antes que el servidor.
tries=0
until pg_isready --host="$PGHOST" --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" --quiet; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "[backup] Postgres no responde en $PGHOST: no se hace copia" >&2
    exit 1
  fi
  sleep 2
done

stamp=$(date +%Y-%m-%d_%H%M%S)
target="$BACKUP_DIR/riuna_${stamp}.sql.gz"
partial="$target.partial"

echo "[backup] volcando $POSTGRES_DB desde $PGHOST -> $target"

# Se escribe a .partial y solo al final se renombra: un contenedor detenido a
# media copia deja basura evidente en vez de un fichero que parece valido.
if ! pg_dump --host="$PGHOST" --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" --format=plain --no-owner --no-privileges \
  | gzip -9 > "$partial"; then
  rm -f "$partial"
  echo "[backup] el volcado ha fallado: no hay copia nueva ni purga" >&2
  exit 1
fi

# pg_dump en formato plano termina siempre con esta linea. Si falta, el volcado
# se corto aunque cada orden devolviera 0, y no puede pasar por una copia.
# gunzip comprueba ademas el CRC: un gzip danado tambien acaba aqui.
footer=$(gunzip -c "$partial" | tail -n 10) || footer=""
case "$footer" in
  *"PostgreSQL database dump complete"*) ;;
  *)
    rm -f "$partial"
    echo "[backup] el volcado esta incompleto: no hay copia nueva ni purga" >&2
    exit 1
    ;;
esac

mv "$partial" "$target"

size=$(du -h "$target" | cut -f1)
echo "[backup] listo: $target ($size)"

# La purga va despues de una copia comprobada, y aun asi respeta un minimo: si
# los volcados fallaran varios dias seguidos, borrar solo por edad acabaria
# vaciando el directorio. Los nombres llevan la fecha, asi que ordenarlos es
# ordenarlos por antiguedad.
deleted=0
for old in $(find "$BACKUP_DIR" -maxdepth 1 -name 'riuna_*.sql.gz' -type f \
  | sort -r | tail -n +"$((BACKUP_KEEP_MIN + 1))"); do
  if [ -n "$(find "$old" -mtime "+$BACKUP_RETENTION_DAYS")" ]; then
    rm -f "$old"
    deleted=$((deleted + 1))
  fi
done
echo "[backup] purgadas $deleted copias de mas de $BACKUP_RETENTION_DAYS dias"

find "$BACKUP_DIR" -name '*.partial' -type f -mtime +1 -delete

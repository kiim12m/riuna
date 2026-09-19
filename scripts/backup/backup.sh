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
#   BACKUP_INTERVAL_HOURS periodo entre copias         (por defecto 24)
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PGHOST="${PGHOST:-postgres}"

export PGPASSWORD="$POSTGRES_PASSWORD"

mkdir -p "$BACKUP_DIR"

stamp=$(date +%Y-%m-%d_%H%M%S)
target="$BACKUP_DIR/riuna_${stamp}.sql.gz"
partial="$target.partial"

echo "[backup] volcando $POSTGRES_DB desde $PGHOST -> $target"

# Se escribe a .partial y solo al final se renombra: un contenedor detenido a
# media copia deja basura evidente en vez de un fichero que parece valido.
pg_dump --host="$PGHOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --format=plain --no-owner --no-privileges \
  | gzip -9 > "$partial"

mv "$partial" "$target"

size=$(du -h "$target" | cut -f1)
echo "[backup] listo: $target ($size)"

# La purga va despues de una copia correcta: si el volcado falla, set -e corta
# antes y no se borra la ultima copia buena que quede.
deleted=$(find "$BACKUP_DIR" -name 'riuna_*.sql.gz' -type f \
  -mtime "+$BACKUP_RETENTION_DAYS" -print -delete | wc -l)
echo "[backup] purgadas $deleted copias de mas de $BACKUP_RETENTION_DAYS dias"

find "$BACKUP_DIR" -name '*.partial' -type f -mtime +1 -delete

#!/bin/sh
# Sube las copias de Riuna a un remoto de rclone (ADR 072).
#
# Pensado para el servicio `offsite` de compose.local.yml, que lo lanza cada
# OFFSITE_INTERVAL_HOURS. El remoto recomendado es Google Drive con un remoto
# `crypt` encima, de modo que Google solo ve ficheros cifrados.
#
# Variables:
#   OFFSITE_REMOTE               destino, p. ej. riuna-cifrado:riuna (obligatoria)
#   BACKUP_DIR                   copias locales                 (por defecto /backups)
#   OFFSITE_RETENTION_DAYS       dias que se conservan fuera     (por defecto 90)
#   OFFSITE_KEEP_MIN             copias que nunca se purgan      (por defecto 5)
#   OFFSITE_MAX_LOCAL_AGE_HOURS  edad maxima de la ultima copia  (por defecto 48)
#
# Deja el resultado en $BACKUP_DIR/.offsite-status.json, que lee el estado de la
# instancia. Sale con 0 solo si subio y la ultima copia local estaba sana.
set -eu
set -o pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
REMOTE="${OFFSITE_REMOTE:?OFFSITE_REMOTE no esta definido: no se sabe a donde subir}"
RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-90}"
KEEP_MIN="${OFFSITE_KEEP_MIN:-5}"
MAX_AGE_HOURS="${OFFSITE_MAX_LOCAL_AGE_HOURS:-48}"
STATUS="$BACKUP_DIR/.offsite-status.json"

now_iso() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

# El ultimo exito se conserva al escribir un fallo: es lo que dice cuanto tiempo
# lleva el remoto sin recibir nada.
previous_success() {
  if [ -f "$STATUS" ]; then
    sed -n 's/.*"lastSuccessAt": *"\([^"]*\)".*/\1/p' "$STATUS" | head -n 1
  fi
}

json_string() {
  if [ -n "$1" ]; then
    printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  else
    printf 'null'
  fi
}

# status <ok|error> <mensaje> <ultimo_exito> <copia> <copias_en_remoto>
write_status() {
  tmp="$STATUS.tmp"
  {
    printf '{\n'
    printf '  "status": "%s",\n' "$1"
    printf '  "checkedAt": "%s",\n' "$(now_iso)"
    printf '  "lastSuccessAt": %s,\n' "$(json_string "$3")"
    printf '  "latest": %s,\n' "$(json_string "$4")"
    printf '  "remoteCount": %s,\n' "${5:-null}"
    printf '  "message": %s\n' "$(json_string "$2")"
    printf '}\n'
  } > "$tmp"
  mv "$tmp" "$STATUS"
}

fail() {
  echo "[offsite] $1" >&2
  write_status error "$1" "$(previous_success)" "${latest_name:-}" ""
  exit 1
}

latest=""
for file in "$BACKUP_DIR"/riuna_*.sql.gz; do
  [ -e "$file" ] && latest="$file"
done
latest_name=$(basename "${latest:-}")

if [ -z "$latest" ]; then
  fail "no hay ninguna copia local en $BACKUP_DIR"
fi

# Lo que justifica purgar: que la ultima copia sea reciente y este entera. Si no,
# se sube lo que haya, pero el remoto no se toca: purgar por edad cuando las
# copias han dejado de llegar es justo lo que vacia el remoto cuando hace falta.
healthy=true
problem=""
if [ -z "$(find "$latest" -mmin "-$((MAX_AGE_HOURS * 60))")" ]; then
  healthy=false
  problem="la ultima copia local ($latest_name) tiene mas de $MAX_AGE_HOURS h"
fi
footer=$(gunzip -c "$latest" | tail -n 10) || footer=""
case "$footer" in
  *"PostgreSQL database dump complete"*) ;;
  *)
    healthy=false
    problem="la ultima copia local ($latest_name) esta danada o incompleta"
    ;;
esac

echo "[offsite] subiendo $BACKUP_DIR a $REMOTE"
# `copy` y nunca `sync`: si ./backups se vaciara por error, `sync` vaciaria
# tambien el remoto. Solo copias terminadas: el `.partial` de un volcado en
# marcha subiria truncado y se quedaria noventa dias pasando por bueno.
if ! rclone copy "$BACKUP_DIR" "$REMOTE" --include 'riuna_*.sql.gz' \
  --max-depth 1 --stats-one-line --stats 0; then
  fail "rclone no ha podido subir a $REMOTE"
fi

remote_files=$(rclone lsf "$REMOTE" --files-only --include 'riuna_*.sql.gz' \
  --max-depth 1 | sort) || fail "rclone no ha podido listar $REMOTE"
remote_count=$(printf '%s\n' "$remote_files" | grep -c . || true)

if [ "$healthy" != true ]; then
  echo "[offsite] $problem: subido lo que habia, sin purgar" >&2
  write_status error "$problem" "$(previous_success)" "$latest_name" "$remote_count"
  exit 1
fi

# La edad sale del nombre, que lleva la fecha del volcado: es la misma en
# cualquier remoto, tambien en los que no conservan la fecha de modificacion.
# Se comparan como numeros AAAAMMDD: `[ a \< b ]` no es POSIX.
cutoff=$(date -u -d "@$(($(date +%s) - RETENTION_DAYS * 86400))" +%Y%m%d)
deleted=0
for name in $(printf '%s\n' "$remote_files" | sort -r | tail -n +"$((KEEP_MIN + 1))"); do
  day=$(printf '%s' "$name" | sed -n 's/^riuna_\([0-9]\{4\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\)_.*/\1\2\3/p')
  if [ -n "$day" ] && [ "$day" -lt "$cutoff" ]; then
    rclone deletefile "$REMOTE/$name"
    deleted=$((deleted + 1))
  fi
done
remote_count=$((remote_count - deleted))

echo "[offsite] listo: $remote_count copias en $REMOTE, purgadas $deleted de mas de $RETENTION_DAYS dias"
write_status ok "" "$(now_iso)" "$latest_name" "$remote_count"

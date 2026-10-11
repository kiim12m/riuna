#!/bin/sh
# Informe de la base de la instancia del PC, para repasar indices con el uso
# real (Fase 9, Bloque 5.1).
#
#   sh scripts/ops/informe-bd.sh > informe-bd.txt
#
# Solo estadisticas: tamanos, recuentos, indices sin uso, barridos y las
# sentencias mas caras, normalizadas (los valores salen como $1). Ni una fila
# de datos, asi que el resultado se puede pasar a quien desarrolla sin sacar
# datos de produccion (AGENTS.md).
#
# Las sentencias necesitan pg_stat_statements cargado al arrancar, como hace
# compose.local.yml desde la Fase 9. Cuanto mas tiempo lleve en marcha, mas
# dicen.
set -eu

# Git Bash convierte las rutas que empiezan por / antes de que las vea Docker.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/../.."

# Dentro del contenedor, que ya tiene POSTGRES_USER y POSTGRES_DB del .env.
# shellcheck disable=SC2016 # las variables se expanden dentro del contenedor
docker compose -f compose.local.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -q -P pager=off' \
  < scripts/ops/informe-bd.sql

# shellcheck disable=SC2016
docker compose -f compose.local.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -X -q -P pager=off -v appdb="$POSTGRES_DB"' \
  < scripts/ops/informe-sentencias.sql

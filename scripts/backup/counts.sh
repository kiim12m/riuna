#!/bin/sh
# Recuentos de las tablas que importan, para comparar una base con su copia
# restaurada (ADR 072). Una linea por tabla, ordenadas: dos salidas iguales son
# dos bases con lo mismo.
#
#   sh counts.sh [base]      (por defecto, POSTGRES_DB)
#
# Corre en el servicio `backup` de compose.local.yml, que ya trae las variables.
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"

psql --host="${PGHOST:-postgres}" --username="$POSTGRES_USER" \
  --dbname="${1:-$POSTGRES_DB}" --no-psqlrc --tuples-only --no-align \
  --field-separator=' ' --set ON_ERROR_STOP=1 <<'SQL'
select 'activity', count(*) from activity
union all select 'comment', count(*) from comment
union all select 'notification', count(*) from notification
union all select 'project', count(*) from project
union all select 'task', count(*) from task
union all select 'time_entry', count(*) from time_entry
union all select 'user', count(*) from "user"
union all select 'workspace', count(*) from workspace
order by 1;
SQL

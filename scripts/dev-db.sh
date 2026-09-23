#!/usr/bin/env bash
#
# Deja lista la PostgreSQL del devcontainer.
#
# La imagen del devcontainer no trae base de datos, y aqui no hay systemd —el
# PID 1 es un `sleep` en bucle—, asi que el `postgresql.service` declarado no lo
# arranca nadie. Sin esto, cada vez que se reabre el contenedor hay que acordarse
# del `pg_ctlcluster` a mano, y tras una reconstruccion, de la instalacion entera.
#
# Lo llama `postStartCommand` en cada arranque. Es idempotente: si ya esta todo,
# no hace nada y tarda menos de un segundo.
#
#   bash scripts/dev-db.sh
set -euo pipefail

cd "$(dirname "$0")/.."

PG_VERSION="${DEV_PG_VERSION:-15}"
DB_USER="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- || true)"
DB_USER="${DB_USER:-riuna}"
DB_NAME="$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2- || true)"
DB_NAME="${DB_NAME:-riuna}"
DB_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env 2>/dev/null | cut -d= -f2- || true)"

if [ -z "$DB_PASSWORD" ]; then
  echo "dev-db: falta POSTGRES_PASSWORD en el .env de la raiz." >&2
  echo "        Copialo de .env.example y ponle cualquier valor." >&2
  exit 1
fi

# `psql` como el superusuario del sistema. `sudo -u postgres` pide terminal en
# este contenedor; `sudo su postgres -c` no.
pg() { sudo su postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$1\""; }

if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "dev-db: instalando PostgreSQL $PG_VERSION..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-client
fi

if ! sudo pg_isready -q 2>/dev/null; then
  echo "dev-db: arrancando el cluster..."
  sudo pg_ctlcluster "$PG_VERSION" main start
  for _ in $(seq 1 30); do
    sudo pg_isready -q 2>/dev/null && break
    command sleep 1
  done
fi

# El rol y las bases, solo si faltan. La contrasena se reescribe siempre para
# que seguir al `.env` no requiera acordarse de nada.
if [ "$(pg "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'")" != "1" ]; then
  echo "dev-db: creando el rol $DB_USER..."
  pg "CREATE ROLE \\\"$DB_USER\\\" LOGIN CREATEDB"
fi
pg "ALTER ROLE \\\"$DB_USER\\\" WITH PASSWORD '$DB_PASSWORD'" >/dev/null

# La de desarrollo y la que usan las pruebas de extremo a extremo, que arrancan
# su propia API contra ella (ver .claude/skills/verify).
for name in "$DB_NAME" "${DB_NAME}_e2e_test"; do
  if [ "$(pg "SELECT 1 FROM pg_database WHERE datname = '$name'")" != "1" ]; then
    echo "dev-db: creando la base $name..."
    pg "CREATE DATABASE \\\"$name\\\" OWNER \\\"$DB_USER\\\""
  fi
done

echo "dev-db: lista en localhost:5432 (bases: $DB_NAME, ${DB_NAME}_e2e_test)"

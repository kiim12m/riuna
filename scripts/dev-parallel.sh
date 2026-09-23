#!/usr/bin/env bash
#
# Un entorno de desarrollo que convive con la instancia de Docker.
#
# La instancia de `compose.local.yml` ocupa el 5173, el 1337 y su propia base de
# datos. Este arranca en **otros puertos y contra otra base**, asi que los dos
# pueden estar en marcha a la vez y lo que se toca aqui no llega alli.
#
# Se sale con Ctrl-C, que para los dos procesos.
set -euo pipefail
# Control de trabajos: cada proceso en segundo plano estrena su propio grupo, y
# asi al salir se para tambien su hijo real (`tsx watch`, `vite`) y no solo el
# `pnpm` que lo envuelve, que es lo que deja puertos ocupados.
set -m

cd "$(dirname "$0")/.."

WEB_PORT="${DEV_WEB_PORT:-5273}"
API_PORT="${DEV_API_PORT:-1437}"

# La base de datos es lo unico que un error aqui no perdona: un entorno de
# desarrollo migrando sobre los datos reales no da un fallo, da un desastre
# callado. AGENTS.md lo prohibe, asi que este entorno solo arranca contra una
# base que viva en esta maquina.
if [ -n "${DEV_DATABASE_URL:-}" ]; then
  db_host="$(node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$DEV_DATABASE_URL")"
  case "$db_host" in
    localhost | 127.0.0.1 | ::1) ;;
    *)
      echo "dev-parallel: DEV_DATABASE_URL apunta a '$db_host', que no es esta maquina." >&2
      exit 1
      ;;
  esac
  export DATABASE_URL="$DEV_DATABASE_URL"
  DB_LABEL="$DEV_DATABASE_URL"
  DB_CHECK_HOST="$db_host"
  DB_CHECK_PORT="$(node -e 'process.stdout.write(new URL(process.argv[1]).port || "5432")' "$DEV_DATABASE_URL")"
else
  # Sin URL explicita, la API deriva la conexion de las `POSTGRES_*` del `.env`
  # de la raiz. Ahi el host por defecto es `postgres`, el nombre del servicio de
  # Compose, que fuera de Compose no resuelve; forzarlo a `localhost` es lo que
  # hace que las mismas credenciales sirvan aqui.
  #
  # Pero si el `.env` define `DATABASE_URL`, esa gana sobre las `POSTGRES_*` y
  # el forzado no serviria de nada. Como no se puede saber a donde apunta sin
  # interpretarla, se para y se pide que lo diga quien lanza.
  if grep -qE "^[[:space:]]*DATABASE_URL=" .env 2>/dev/null; then
    echo "dev-parallel: el .env de la raiz define DATABASE_URL y tiene prioridad." >&2
    echo "              Lanza con DEV_DATABASE_URL=... para decir contra que base." >&2
    exit 1
  fi
  unset DATABASE_URL
  export POSTGRES_HOST="${DEV_POSTGRES_HOST:-localhost}"
  export POSTGRES_PORT="${DEV_POSTGRES_PORT:-5432}"
  DB_LABEL="$POSTGRES_HOST:$POSTGRES_PORT (usuario y base, del .env)"
  DB_CHECK_HOST="$POSTGRES_HOST"
  DB_CHECK_PORT="$POSTGRES_PORT"
fi

# Un aviso de una linea en vez de la pared de traza que suelta la API cuando la
# base no responde. Pasa cada vez que se reabre el contenedor sin que haya
# corrido `postStartCommand`.
if ! (exec 3<>"/dev/tcp/$DB_CHECK_HOST/$DB_CHECK_PORT") 2>/dev/null; then
  echo "dev-parallel: no hay nada escuchando en $DB_CHECK_HOST:$DB_CHECK_PORT." >&2
  echo "              Arranca la base con 'pnpm dev:db'." >&2
  exit 1
fi
exec 3>&-

for port in "$WEB_PORT" "$API_PORT"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    exec 3>&-
    echo "dev-parallel: el puerto $port ya esta ocupado." >&2
    echo "              Para lo que haya ahi, o cambia DEV_WEB_PORT / DEV_API_PORT." >&2
    exit 1
  fi
done

export NODE_ENV=development
export PORT="$API_PORT"
# El `.env` de la raiz apunta a la instancia de Docker. Estas tres lo pisan
# —dotenv no sobrescribe lo que ya esta en el entorno— para que Better Auth se
# fie del origen de **este** entorno y no del otro.
export RIUNA_CLIENT_URL="http://localhost:$WEB_PORT"
export RIUNA_API_URL="http://localhost:$API_PORT"
export RIUNA_INTERNAL_API_URL="http://127.0.0.1:$API_PORT"

# Vite da a las variables `VITE_*` del entorno mas prioridad que a cualquier
# fichero `.env`, asi que el proxy queda configurado sin tocar ninguno.
export VITE_API_URL=/
export VITE_CLIENT_URL="http://localhost:$WEB_PORT"
export DEV_PROXY_API_TARGET="http://127.0.0.1:$API_PORT"
export DEV_PROXY_ORIGIN="http://localhost:$WEB_PORT"
# Lo lee `vite.config.ts`. Por la linea de ordenes no vale: `pnpm ... -- --port`
# llega a vite como `vite -- --port`, y vite descarta lo que va tras el `--`.
export DEV_WEB_PORT="$WEB_PORT"

# Los dos por separado y no con `pnpm dev`: con la salida redirigida y mas de
# una tarea persistente, turbo imprime el banner de `tsx watch` y la API no
# llega a abrir el puerto nunca (ver .claude/skills/verify).
pnpm --filter @riuna/api dev &
api_pid=$!
pnpm --filter @riuna/web dev &
web_pid=$!

trap 'kill -- -"$api_pid" -"$web_pid" 2>/dev/null || true' EXIT INT TERM

echo
echo "  web  http://localhost:$WEB_PORT   (la API va por debajo, en /api)"
echo "  api  http://localhost:$API_PORT   (no hace falta alcanzarlo desde el navegador)"
echo "  base $DB_LABEL"
echo

wait

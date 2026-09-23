# El entorno de desarrollo

Para ver un cambio antes de llevarlo a los contenedores. Corre **en paralelo** a
la instancia de `compose.local.yml`, sin tocarla: otros puertos y otra base de
datos.

| | Instancia Docker | Entorno de desarrollo |
|---|---|---|
| Web | 5173 | **5273** |
| API | 1337 | **1437**, solo por debajo del proxy |
| Base | su contenedor (5433 en el host) | la PostgreSQL local |

## El día a día

```bash
pnpm dev:parallel
```

Y abrir **http://localhost:5273**. Eso es todo: la base ya está en marcha, y los
dos servidores recargan solos al guardar un fichero. Se sale con Ctrl-C.

Solo hace falta alcanzar el 5273. La API viaja por debajo, en `/api`, así que da
igual desde dónde se entre —localhost, la IP del contenedor, un túnel—: el proxy
reescribe la cabecera `Origin` a la de confianza y Better Auth la acepta sin
tener que enumerarla en ningún sitio.

## La primera vez, y después de reconstruir el contenedor

```bash
pnpm dev:parallel     # en una terminal
pnpm dev:seed         # en otra, una sola vez
```

`dev:seed` crea dos cuentas, un espacio, tres proyectos y doce tareas:

| Correo | Contraseña | Para qué |
|---|---|---|
| `dev@riuna.local` | `Dev-passw0rd!` | propietario: lo ve todo |
| `miembro@riuna.local` | `Miembro-passw0rd!` | miembro raso: comprueba lo que **no** se ve |

Va por HTTP contra la API y no escribiendo filas, porque las contraseñas las
cifra Better Auth: metidas a mano darían usuarios con los que no se puede
entrar. Repetirlo es inofensivo; si el propietario ya existe, no toca nada.

## Qué sobrevive a qué

- **Cerrar el editor o la sesión de Claude.** Los servidores siguen: cuelgan del
  PID 1 del contenedor, no de la terminal.
- **Parar el contenedor.** Se va todo. Al volver, `pnpm dev:parallel` y listo:
  PostgreSQL la levanta `postStartCommand` sola.
- **Reconstruir el contenedor.** Se pierden también la base y sus datos, porque
  PostgreSQL se instala dentro del contenedor y no en un volumen. El arranque la
  reinstala y la recrea vacía; queda sembrar otra vez con `pnpm dev:seed`. Los
  `node_modules` sí sobreviven, que están en volúmenes con nombre.

## La memoria del contenedor es el límite real

`pnpm --filter @riuna/web typecheck` muere con **exit 137** aunque el árbol esté
limpio, y el servidor de desarrollo también si se lanzan a la vez los tests o el
build. **Una cosa cada vez.** Si la web deja de responder, casi siempre es esto:
`pnpm dev:parallel` otra vez.

## Los tres guiones

| | Qué hace |
|---|---|
| `pnpm dev:db` | Instala si falta, arranca y crea rol y bases. Idempotente. Lo llama el arranque del contenedor |
| `pnpm dev:parallel` | Levanta API y web con sus puertos y su entorno |
| `pnpm dev:seed` | Siembra usuarios y datos de ejemplo |

Todo es ajustable por entorno: `DEV_WEB_PORT`, `DEV_API_PORT`,
`DEV_DATABASE_URL`, `DEV_POSTGRES_HOST`, `DEV_POSTGRES_PORT`. Las variables que
consume el proxy están en
[ENVIRONMENT_SETUP.md](../ENVIRONMENT_SETUP.md#serving-the-api-through-the-dev-server-one-port-instead-of-two).

## Por qué no se toca el `.env` de la raíz

Ese fichero apunta a la instancia desplegada, y así debe seguir. `dev-parallel.sh`
pisa `RIUNA_CLIENT_URL`, `RIUNA_API_URL` y el host de la base **en su propio
entorno**; `dotenv-mono` no sobrescribe lo que ya está puesto, así que gana lo
del proceso y no hay que acordarse de deshacer nada.

**La base es lo único que el guion no adivina**, a propósito: un entorno de
desarrollo migrando sobre datos reales no da un error, da un desastre callado
—`AGENTS.md` lo prohíbe—. Solo arranca contra una base de esta máquina, y si el
`.env` llegara a definir un `DATABASE_URL` propio se para y pide que se le diga
cuál, porque ese valor ganaría al host forzado y no hay forma de saber a dónde
apunta sin interpretarlo.

## Dos precedencias que cuestan encontrar

- En Vite, una variable `VITE_*` **del entorno** gana a todos los ficheros
  `.env`. Entre ficheros, `.env.[modo]` gana a `.env.local`, que es por lo que
  un `VITE_API_URL` puesto en `.env.local` parece no hacer nada:
  `apps/web/.env.development` ya fija esa clave.
- `pnpm … dev -- --port N` le llega a vite como `vite -- --port N`, y vite
  descarta lo que va tras el `--`. El puerto se pasa por `DEV_WEB_PORT`, que lee
  `vite.config.ts`.

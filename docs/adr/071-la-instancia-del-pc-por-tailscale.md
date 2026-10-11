# ADR 071 — La instancia del PC, solo por Tailscale, y actualizar con red

**Fecha:** 2026-10-11 · **Estado:** aceptada

**Contexto.** La instancia corre en el PC con `compose.local.yml`, y se entraba por la IP de
Tailscale y los puertos. Tenía tres problemas:

- **Los puertos escuchaban en todas las interfaces.** El 5433 de Postgres, también: desde la
  red local se llegaba a la base con solo la contraseña.
- **No había HTTPS**, y la web y la API eran dos orígenes distintos.
- **Actualizar era construir y levantar.** Las migraciones corren al arrancar y la copia
  previa era un paso que había que recordar. Si una migración fallaba, el único rastro era el
  log de un contenedor que se reiniciaba en bucle.

El despliegue en Oracle ([plan de despliegue](../plan-despliegue.md)) se pospone por decisión
del usuario (2026-10-10).

**Decisión.**

- **Los puertos de `compose.local.yml` escuchan en `127.0.0.1`.** `RIUNA_BIND_ADDRESS` lo
  cambia, y con `0.0.0.0` vuelve a como estaba.
- **Se publica con `tailscale serve`**, con HTTPS y una sola URL:
  - `/` va a la web (5173);
  - `/api` va a la API (`http://127.0.0.1:1337/api`). `serve` quita el prefijo del montaje y
    le añade el de la ruta de destino, así que hay que repetirlo en ella.
  - `RIUNA_CLIENT_URL` y `RIUNA_API_URL` pasan a la URL de Tailscale.
- **Migrar y servir se separan.** La orden `migrate` (`node dist/migrate.js`):
  - hace lo mismo que el arranque antes de servir (`database/run-migrations.ts`) y sale con 0
    o con 1;
  - el arranque normal sigue migrando, porque CI, Helm y el humo dependen de ello.
- **`deploy/actualizar.sh` es la única orden para actualizar.**
  - Se niega con el worktree sucio.
  - Construye mientras la versión vieja sigue sirviendo.
  - Hace una copia y para si falla.
  - Migra con la imagen nueva antes de cambiar nada.
  - Levanta y espera a que la API esté sana.
  - Si algo falla, imprime cómo volver atrás, sin revertir solo. Con la base ya migrada,
    volver a la imagen vieja la deja sobre un esquema que no es el suyo, y esa decisión se toma
    con la copia delante.
- **La versión que sirve se lee de la imagen, no de git.** La etiqueta
  `org.opencontainers.image.revision` se sella al construir. Tras un despliegue fallido, `HEAD`
  y lo que sirve no coinciden.

**Consecuencias.**

- Para entrar desde otro dispositivo hace falta Tailscale en él.
- Antes de la primera actualización con esta versión hay que montar `tailscale serve` y cambiar
  las URL del `.env`: si no, cerrar los puertos deja fuera a quien entraba por la IP. El orden
  está en [actualizar](../actualizar.md).
- El guion corre en Git Bash, y por eso fija `MSYS_NO_PATHCONV=1`. Sin eso, Git Bash convierte
  `/scripts/backup.sh` en una ruta de Windows antes de que la vea Docker.
- `pg_stat_statements` se carga en el Postgres del PC para el repaso de índices de la Fase 9.
  La extensión se crea en la base `postgres`, así que no viaja en las copias.

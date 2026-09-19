# ADR 029 — `node_modules` en volúmenes del devcontainer

**Fecha:** 2026-09-08 · **Estado:** aceptada

**Contexto.** El worktree está montado como bind en el devcontainer
(`C:\Users\Quim\Documents\GitHub\riuna` → `/workspaces/riuna`), así que host y
contenedor compartían un único `node_modules`, y **solo uno puede ser su dueño**.
Un `pnpm install` dentro del contenedor escribe enlaces simbólicos de WSL —etiqueta
de reparse `0xa000001d`, `IO_REPARSE_TAG_LX_SYMLINK`— hacia rutas Linux absolutas
(`/workspaces/riuna/node_modules/.pnpm/turbo@2.10.8/…`). Node de Windows no puede
recorrerlos: `pnpm dev` moría con `Cannot find module …\node_modules\turbo\bin\turbo`,
y el `pnpm install` de rescate desde Windows moría a su vez con
`EACCES: lstat …\@types\.ignored_node`, porque `lstat` sobre un reparse point LX
devuelve acceso denegado. El install parcial dejó además un árbol **mixto** —shims
nativos `.CMD`/`.ps1` junto a enlaces de contenedor— que no se puede reparar en
sitio: hay que borrar los nueve `node_modules` y reinstalar.

**Decisión.** Cada `node_modules` del workspace —la raíz y los ocho paquetes— se
monta como volumen nombrado, de forma que la ruta del bind queda ensombrecida y
cada lado mantiene su propia instalación del mismo lockfile. Un décimo volumen
guarda el store de pnpm en `/home/node/.pnpm-store`, fijado con
`npm_config_store_dir` por `containerEnv` para no tocar ningún `.npmrc` del repo.
`onCreateCommand` hace `chown node:node` sobre los diez: Docker crea los volúmenes
vacíos como `root` y pnpm corre como `node`. `postCreateCommand` ejecuta
`corepack enable pnpm && pnpm install`, porque un volumen recién creado está vacío.
Se añade la feature `node:1` en versión 24: la imagen `typescript-node` de MCR se
queda en Node 22 —no existe etiqueta `1-24`, ni en `typescript-node` ni en
`javascript-node`— y el `package.json` raíz exige `engines.node >= 24.0.0`.

**Consecuencias.**
- El store y los `node_modules` viven en volúmenes distintos, o sea dispositivos
  distintos, y los hard links no los cruzan: pnpm lo detecta y cae a copia. Cuesta
  disco y tiempo, no corrección.
- Se descarta `volume-subpath`, que pondría store y store virtual en el mismo
  volumen y devolvería los hard links: Docker exige que el subdirectorio ya exista
  dentro del volumen, así que falla en el primer arranque, justo cuando está vacío.
- El volumen del store sobrevive a los rebuilds. La instalación inicial descargó
  los 1285 paquetes en 3 m 32 s y ocupa 1,5 GB; las siguientes salen de ahí.
- Los mounts de un contenedor son inmutables: `devcontainer up` a secas **reutiliza
  el contenedor existente** y esta configuración no se aplica. Hace falta
  `--remove-existing-container`, o «Rebuild Container» en VS Code.
- El `typescript` global de la imagen queda bajo el Node 22 de nvm y sale del
  `PATH`. Da igual: el repo trae TypeScript como dependencia de desarrollo.
- `docker exec … bash -lc` no encuentra `node`, porque nvm exporta el `PATH` en
  `.bashrc` y no en `/etc/profile`. Usar `bash -ic`. Los comandos de ciclo de vida
  del devcontainer no se ven afectados.

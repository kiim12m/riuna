# Copias de seguridad

Una copia que nunca se ha restaurado no es una copia, es una suposición. Este
documento describe cómo se hacen y, sobre todo, cómo se comprueban.

## Cómo funciona

El servicio `backup` de `compose.local.yml` usa **la misma imagen de Postgres
que el servidor**, para que `pg_dump` y el servidor no se desalineen nunca de
versión, y para no añadir una dependencia más que operar. Arranca con el resto
del entorno:

```bash
docker compose -f compose.local.yml up -d postgres backup
```

Hace un volcado nada más arrancar y luego cada `BACKUP_INTERVAL_HOURS`. Los
ficheros van a `./backups` del host (ignorado por git) como
`riuna_AAAA-MM-DD_HHMMSS.sql.gz`.

| Variable | Por defecto | Qué hace |
|---|---|---|
| `BACKUP_INTERVAL_HOURS` | 24 | Horas entre copias |
| `BACKUP_RETENTION_DAYS` | 14 | Días que se conservan antes de purgar |
| `BACKUP_KEEP_MIN` | 3 | Copias más recientes que no se purgan nunca, tengan la edad que tengan |

Los detalles que evitan los fallos clásicos:

- **Espera a Postgres** con `pg_isready` antes de volcar. Al reiniciarse Docker,
  el servicio `backup` y Postgres arrancan a la vez y `depends_on` no espera:
  hasta septiembre de 2026 eso dejaba volcados vacíos.
- **Un volcado fallido no deja fichero.** `pipefail` hace que el fallo de
  `pg_dump` cuente aunque `gzip` termine bien, y antes de dar la copia por
  buena se comprueba que descomprime y que acaba con la línea final de
  `pg_dump` («PostgreSQL database dump complete»).
- El volcado se escribe como `.partial` y solo se renombra cuando ha pasado esa
  comprobación. Un contenedor detenido a media copia deja basura evidente, no
  un fichero truncado que aparenta estar bien.
- La purga se ejecuta **después** de una copia comprobada, y aun así conserva
  siempre las `BACKUP_KEEP_MIN` más recientes: si las copias fallaran varios
  días seguidos, purgar solo por edad acabaría dejando el directorio vacío.

## Probar una restauración (hazlo cada pocos meses)

Se restaura sobre una base **aparte**, así que no toca los datos reales:

```bash
docker compose -f compose.local.yml exec backup sh -c 'sh /scripts/restore.sh $(ls /backups/riuna_*.sql.gz | tail -1) riuna_restore_test'
```

Y se comparan las dos bases:

```bash
docker exec riuna-postgres-1 psql -U riuna -d riuna -c "select 'task' t, count(*) from task union all select 'activity', count(*) from activity union all select 'project', count(*) from project order by 1;"
```

Repite el mismo comando cambiando `-d riuna` por `-d riuna_restore_test`. Los
recuentos deben coincidir. Después, borra la base de prueba:

```bash
docker exec riuna-postgres-1 psql -U riuna -d postgres -c "DROP DATABASE riuna_restore_test WITH (FORCE);"
```

**Última prueba superada:** 23 de agosto de 2026 — 23 tareas, 25 actividades,
2 proyectos, 2 equipos y 2 tareas con equipo asignado, idénticos en origen y
en la copia restaurada.

## Restaurar de verdad

Solo cuando haya que recuperar la instancia. **Borra la base real** y la
sustituye por el contenido del volcado:

```bash
docker compose -f compose.local.yml exec backup sh -c 'sh /scripts/restore.sh /backups/riuna_AAAA-MM-DD_HHMMSS.sql.gz'
```

Para la API en marcha antes de hacerlo, o mantendrá conexiones abiertas contra
una base que está siendo recreada.

La restauración no toca la base de destino hasta el final:

1. Comprueba el fichero (que descomprime y que el volcado está completo). Si no
   pasa, sale sin haber borrado nada.
2. Carga el volcado en una base aparte, `<destino>__restoring`. Si la carga
   falla, la borra y la base de destino sigue como estaba.
3. Solo entonces borra la base de destino y renombra la nueva en su lugar.

## Copias fuera de la máquina

El servicio `offsite` de `compose.local.yml` sube `./backups` a **Google Drive, cifrado**,
cada `OFFSITE_INTERVAL_HOURS` ([ADR 072](adr/072-copias-fuera-de-la-maquina-y-simulacro.md)).
Lo hace `scripts/backup/offsite.sh` con rclone: un remoto `drive` y, encima, uno `crypt`,
así que Google solo ve nombres y contenidos cifrados.

| Variable | Por defecto | Qué hace |
|---|---|---|
| `OFFSITE_REMOTE` | — | Destino, p. ej. `riuna-cifrado:copias` |
| `OFFSITE_INTERVAL_HOURS` | 6 | Horas entre subidas |
| `OFFSITE_RETENTION_DAYS` | 90 | Días que se conservan fuera |
| `OFFSITE_KEEP_MIN` | 5 | Copias más recientes que no se purgan nunca |

Los detalles que importan:

- **`rclone copy`, nunca `sync`.** Si `./backups` se vaciara por error, `sync` vaciaría también
  Drive.
- **Solo sube copias terminadas** (`riuna_*.sql.gz`), nunca el `.partial` de un volcado en
  marcha.
- **No purga a ciegas.** Antes de borrar nada en Drive comprueba que la copia local más
  reciente tiene menos de 48 h y está entera. Si no, sube lo que haya, no borra nada y sale con
  error. Purgar por edad cuando las copias han dejado de llegar es justo lo que vacía el
  remoto cuando más falta hace.
- Deja el resultado en `backups/.offsite-status.json`: estado, último éxito, última copia y
  cuántas hay en Drive.

### Montarlo (una vez, unos 15 minutos)

Desde la raíz del repositorio, en Git Bash:

1. **Baja rclone para Windows** (el zip de [rclone.org/downloads](https://rclone.org/downloads/))
   y descomprímelo en cualquier sitio. Solo hace falta para autorizar Drive desde un navegador.
2. **Crea los dos remotos dentro del contenedor:**

   ```bash
   MSYS_NO_PATHCONV=1 docker compose -f compose.local.yml run --rm --entrypoint rclone offsite config
   ```

   - **`gdrive`**:
     - tipo `drive`, con `client_id` y `client_secret` vacíos (o los tuyos, si los creas);
     - **scope `drive.file`**: rclone solo ve lo que él mismo crea, no el resto de tu Drive;
     - cuando pregunte por el navegador, responde **`n`**. Te dará una orden
       `rclone authorize "drive" "…"`: ejecútala en Windows con el `rclone.exe` del paso 1,
       autoriza en el navegador y pega el resultado.
   - **`riuna-cifrado`**:
     - tipo `crypt`, con `remote = gdrive:riuna-copias`;
     - cifrado de nombres `standard`;
     - deja que rclone **genere las dos contraseñas** (`g`).
3. **Guarda las dos contraseñas de `riuna-cifrado` en tu gestor de contraseñas.** Ahora, no
   luego. Si se pierde el PC, `deploy/rclone/rclone.conf` se va con él, y sin esas dos
   contraseñas las copias de Drive son ruido.
4. En el `.env`:

   ```env
   COMPOSE_PROFILES=offsite
   OFFSITE_REMOTE=riuna-cifrado:copias
   ```

5. Arráncalo y comprueba la primera subida:

   ```bash
   docker compose -f compose.local.yml up -d offsite
   docker compose -f compose.local.yml logs offsite
   cat backups/.offsite-status.json
   MSYS_NO_PATHCONV=1 docker compose -f compose.local.yml run --rm --entrypoint rclone offsite lsf riuna-cifrado:copias
   ```

Con `COMPOSE_PROFILES=offsite` en el `.env`, `deploy/actualizar.sh` lo levanta con el resto.

### Recuperar desde Drive (si el PC se pierde)

En la máquina nueva, con el repositorio clonado y un `.env` nuevo:

1. Crea otra vez los dos remotos (paso 2 de arriba), y en `riuna-cifrado` **escribe las dos
   contraseñas guardadas** en vez de generarlas.
2. Baja la copia que quieras (la lista sale con `lsf`):

   ```bash
   mkdir -p backups
   MSYS_NO_PATHCONV=1 docker compose -f compose.local.yml run --rm --entrypoint rclone offsite \
     copy riuna-cifrado:copias/riuna_AAAA-MM-DD_HHMMSS.sql.gz /backups/
   ```

3. Levanta la base y restaura como en «Restaurar de verdad»:

   ```bash
   docker compose -f compose.local.yml up -d postgres backup
   docker compose -f compose.local.yml exec backup sh /scripts/restore.sh /backups/riuna_AAAA-MM-DD_HHMMSS.sql.gz
   sh deploy/actualizar.sh
   ```

Bajar una copia de Drive y restaurarla en `riuna_restore_test` (como en «Probar una
restauración») es también la forma de comprobar, de vez en cuando, que la copia externa sirve.

## Lo que esto no cubre

- **Los adjuntos**, si algún día se guardan fuera de la base de datos (S3 o disco). Hoy no
  aplica.
- **Perder las contraseñas del cifrado.** Sin ellas, las copias de Drive no se pueden leer, por
  diseño.

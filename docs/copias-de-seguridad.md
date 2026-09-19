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

## Lo que esto no cubre

- **Los adjuntos**, si algún día se guardan fuera de la base de datos (S3 o
  disco). Hoy no aplica.
- **Copias fuera de la máquina.** Todo vive en el mismo disco: un fallo de ese
  disco se lleva la instancia y sus copias por delante. Sincronizar `./backups`
  a otro sitio es trabajo pendiente de la fase de operación.

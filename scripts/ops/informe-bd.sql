-- Informe de la base de Riuna para el repaso de indices (Fase 9, Bloque 5.1).
-- Solo estadisticas y recuentos: ni una fila de datos. Lo lanza informe-bd.sh.
\pset footer off
\echo '# Riuna: informe de la base (solo estadisticas, ni una fila de datos)'
\echo
SELECT
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') AS generado,
  current_database() AS base,
  current_setting('server_version') AS postgresql,
  pg_size_pretty(pg_database_size(current_database())) AS tamano;

\echo '## Desde cuando cuentan las estadisticas (vacio: desde que arranco el servidor)'
SELECT stats_reset AS desde FROM pg_stat_database WHERE datname = current_database();

\echo '## Volumen'
SELECT
  (SELECT count(*) FROM task) AS tareas,
  (SELECT count(*) FROM project) AS proyectos,
  (SELECT count(*) FROM "user") AS personas,
  (SELECT count(*) FROM activity) AS actividad;

\echo '## Los cinco proyectos con mas tareas (solo el recuento)'
SELECT count(*) AS tareas FROM task GROUP BY project_id ORDER BY 1 DESC LIMIT 5;

\echo '## Indices que no se han usado nunca (sin contar unicos ni claves primarias)'
SELECT
  s.relname AS tabla,
  s.indexrelname AS indice,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamano
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC, 1, 2;

\echo '## Tablas con mas filas leidas en barridos secuenciales'
SELECT
  relname AS tabla,
  n_live_tup AS filas,
  seq_scan AS barridos,
  seq_tup_read AS filas_barridas,
  coalesce(idx_scan, 0) AS usos_de_indice
FROM pg_stat_user_tables
WHERE seq_tup_read > 0
ORDER BY seq_tup_read DESC
LIMIT 15;

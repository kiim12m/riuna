-- Las sentencias mas caras de la base de Riuna, de pg_stat_statements (Fase 9,
-- Bloque 5.1). Corre en la base `postgres`, donde vive la extension para que no
-- viaje en las copias; `appdb` es la de Riuna. Las sentencias van normalizadas:
-- los valores salen como $1, $2..., nunca tal cual.
\pset footer off
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

\echo '## Desde cuando cuentan las sentencias'
SELECT stats_reset AS desde FROM pg_stat_statements_info;

\echo '## Las 20 que mas tiempo suman'
SELECT
  calls AS llamadas,
  round(total_exec_time)::bigint AS ms_total,
  round(mean_exec_time::numeric, 1) AS ms_media,
  round(max_exec_time::numeric, 1) AS ms_max,
  rows AS filas,
  left(regexp_replace(query, '\s+', ' ', 'g'), 300) AS sentencia
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = :'appdb')
ORDER BY total_exec_time DESC
LIMIT 20;

\echo '## Las 15 mas lentas de media, entre las que se llaman al menos 20 veces'
SELECT
  calls AS llamadas,
  round(mean_exec_time::numeric, 1) AS ms_media,
  round(max_exec_time::numeric, 1) AS ms_max,
  left(regexp_replace(query, '\s+', ' ', 'g'), 300) AS sentencia
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = :'appdb')
  AND calls >= 20
ORDER BY mean_exec_time DESC
LIMIT 15;

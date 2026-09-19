import { sql } from "drizzle-orm";
import type db from "../../database";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serializa las escrituras de arbol de un proyecto.
 *
 * `parent_id` manda y `path`/`depth` son su forma materializada, asi que toda
 * escritura de arbol lee el estado, decide, y escribe. Sin cerrojo esas tres
 * fases se entrelazan y las dos CHECK de la base no lo notan, porque cada fila
 * queda internamente coherente:
 *
 * - Dos reparentados cruzados (`A` bajo `B` y `B` bajo `A`) validan los dos
 *   contra la foto anterior, tocan filas distintas —asi que no compiten por
 *   ningun bloqueo de fila— y confirman los dos. Resultado: un ciclo, ninguna
 *   de las dos con `parent_id` nulo, y las dos ramas desaparecidas de las
 *   vistas de arbol.
 * - Un reparentado anidado mientras se mueve el ancestro deja `parent_id`
 *   apuntando a un sitio y `path` a otro, porque el `UPDATE ... WHERE path
 *   LIKE` se reevalua contra la version nueva y no casa, mientras que el
 *   `UPDATE ... WHERE id` si.
 *
 * Un cerrojo por proyecto los cierra todos de una vez, y en un solo sitio, en
 * lugar de repartir `FOR UPDATE` por cuatro controladores con ordenes de
 * bloqueo distintos —que es de donde salen los interbloqueos—. Las lecturas no
 * se bloquean: solo compiten entre si las escrituras de arbol del mismo
 * proyecto, que son gestos humanos, no trafico.
 *
 * Quien lo tome debe leer el estado del arbol **despues**, ya dentro de la
 * transaccion: tomarlo y luego usar una lectura anterior no sirve de nada.
 *
 * El 1148 es el espacio de nombres de este cerrojo; el 1524 es el de la
 * ordenacion de proyectos (`createProject`, `reorderProjects`).
 */
export async function lockProjectTree(tx: Tx, projectId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(1148, hashtext(${projectId}))`,
  );
}

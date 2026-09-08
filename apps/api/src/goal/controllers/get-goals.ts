import { and, asc, eq, inArray, or } from "drizzle-orm";
import aggregate from "../../dashboard/aggregate";
import db from "../../database";
import { goalTable, goalTargetTable } from "../../database/schema";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import { buildFilter } from "../../view/build-filter";
import {
  buildFieldRegistry,
  type FieldRegistry,
} from "../../view/field-registry";
import { FilterError } from "../../view/filter-to-sql";
import { getWorkspaceFieldRegistry } from "../../view/workspace-registry";
import type { TargetConfig } from "../target-config";

/**
 * Los objetivos de quien pregunta, con el progreso ya calculado.
 *
 * El progreso **no se guarda**: se mide al leer, con el mismo `aggregate()` que
 * alimenta los widgets. Es lo que quiere decir "avanza al cerrar tareas" sin
 * ningun disparador ni recalculo programado — cerrar una tarea mueve
 * `completed_at`, y la siguiente lectura ya cuenta distinto.
 *
 * Un resultado clave que no se puede medir —su filtro nombra un campo que ya no
 * existe— lleva su propio error y no tumba el objetivo entero, igual que un
 * widget roto no tumba el panel.
 */
export default async function getGoals(workspaceId: string, userId: string) {
  // La propiedad se filtra en la consulta y no en memoria: leer los objetivos
  // de los demas para descartarlos despues es traerse a la aplicacion datos que
  // no le tocan.
  const visible = await db
    .select()
    .from(goalTable)
    .where(
      and(
        eq(goalTable.workspaceId, workspaceId),
        // Propios y compartidos. Un OKR que solo ve quien lo escribe no es un
        // OKR: era la limitacion mas visible de la rebanada 3.
        or(eq(goalTable.createdBy, userId), eq(goalTable.isShared, true)),
      ),
    )
    .orderBy(asc(goalTable.position), asc(goalTable.createdAt));

  if (visible.length === 0) return [];

  const targets = await db
    .select()
    .from(goalTargetTable)
    .where(
      inArray(
        goalTargetTable.goalId,
        visible.map((goal) => goal.id),
      ),
    )
    .orderBy(asc(goalTargetTable.position), asc(goalTargetTable.createdAt));

  const targetsByGoal = new Map<string, typeof targets>();
  for (const target of targets) {
    const list = targetsByGoal.get(target.goalId) ?? [];
    list.push(target);
    targetsByGoal.set(target.goalId, list);
  }

  // Un registro por proyecto y uno del espacio, reutilizados entre resultados:
  // varios suelen apuntar al mismo sitio y resolverlo por cada uno seria pagar
  // la misma consulta dos veces.
  const projectRegistries = new Map<string, FieldRegistry>();
  let workspaceRegistry: FieldRegistry | null = null;

  async function registryFor(projectId: string | null) {
    if (!projectId) {
      workspaceRegistry ??= await getWorkspaceFieldRegistry(workspaceId);
      return workspaceRegistry;
    }

    const cached = projectRegistries.get(projectId);
    if (cached) return cached;

    const definitions = await getFieldDefinitionsForProject(
      workspaceId,
      projectId,
      true,
    );
    const registry = buildFieldRegistry(definitions);
    projectRegistries.set(projectId, registry);
    return registry;
  }

  return Promise.all(
    visible.map(async (goal) => ({
      ...goal,
      targets: await Promise.all(
        (targetsByGoal.get(goal.id) ?? []).map(async (target) => {
          const config = target.config as TargetConfig;

          try {
            const registry = await registryFor(target.projectId);
            const result = await aggregate({
              workspaceId,
              // **La persona del objetivo, no la que mira.** Un resultado con
              // ambito "asignadas a mi" en un objetivo compartido daria un
              // numero distinto a cada uno, y un OKR es una sola cifra: si el
              // equipo no ve lo mismo, no estan mirando el mismo objetivo.
              //
              // Es al reves que en un widget, donde `scope` significa a
              // proposito "el trabajo de quien mira" — un panel compartido en
              // el que cada uno ve su parte es util; un OKR asi, no.
              userId: goal.createdBy,
              scope: config.scope,
              projectId: target.projectId,
              filter: buildFilter(config.filter ?? []),
              registry,
              metric:
                (config.metric as Parameters<typeof aggregate>[0]["metric"]) ??
                "doneCount",
              // El periodo del objetivo **es** la ventana de medida. Sin el,
              // "cerrar 40 este trimestre" contaria las de siempre.
              from: goal.startsAt,
              to: goal.endsAt,
            });

            return {
              ...target,
              current: result.buckets[0]?.value ?? 0,
            };
          } catch (error) {
            if (!(error instanceof FilterError)) {
              console.error(`[goal] target ${target.id} failed`, error);
            }

            return {
              ...target,
              current: null,
              error:
                error instanceof FilterError
                  ? error.message
                  : "This key result could not be measured",
            };
          }
        }),
      ),
    })),
  );
}

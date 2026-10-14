import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { fieldDefinitionTable } from "../../database/schema";
import {
  getFieldDefinitionsForProject,
  getWorkspaceFieldDefinitions,
} from "../controllers/get-field-definitions";
import { assertFormulaCompiles, parseStoredFormula } from "./compile";
import {
  FormulaError,
  type FormulaNode,
  formatFormula,
  parseFormula,
  referencedKeys,
  resolveFormulaNames,
} from "./parse";

type Definition = {
  id: string;
  key: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
};

/**
 * Los campos que ve una formula al definirse: los del proyecto mas los del
 * espacio si es de un proyecto, y solo los del espacio si es del espacio —un
 * campo de espacio se calcula en todos los proyectos, y uno de un proyecto no
 * existe en los demas—.
 */
async function scopeDefinitions(
  workspaceId: string,
  projectId: string | null,
): Promise<Definition[]> {
  return projectId
    ? getFieldDefinitionsForProject(workspaceId, projectId)
    : getWorkspaceFieldDefinitions(workspaceId, false, "task");
}

function storedFormulas(definitions: Definition[]) {
  const formulas = new Map<string, FormulaNode>();
  for (const definition of definitions) {
    if (definition.type !== "formula") continue;
    try {
      formulas.set(
        definition.key,
        parseStoredFormula(String(definition.config.expression ?? "")),
      );
    } catch {
      formulas.set(definition.key, { kind: "empty" });
    }
  }
  return formulas;
}

/**
 * Si, siguiendo las formulas que lee, `key` acaba leyendose a si misma. Devuelve
 * el nombre del campo por el que se cierra el ciclo, para decirlo en el error.
 */
function findCycle(
  key: string,
  formulas: Map<string, FormulaNode>,
): string | null {
  const visit = (current: string, seen: Set<string>): string | null => {
    const formula = formulas.get(current);
    if (!formula) return null;
    for (const next of referencedKeys(formula)) {
      if (next === key) return current;
      if (seen.has(next)) continue;
      seen.add(next);
      const found = visit(next, seen);
      if (found) return found;
    }
    return null;
  };
  return visit(key, new Set());
}

/**
 * Valida la formula de un campo calculado y la devuelve en su forma canonica,
 * con claves en vez de nombres (ADR 090). Se llama al crear el campo y cada
 * vez que cambia su configuracion.
 */
export async function prepareFormulaConfig({
  workspaceId,
  projectId,
  key,
  name,
  config,
}: {
  workspaceId: string;
  projectId: string | null;
  key: string;
  name: string;
  config: Record<string, unknown>;
}) {
  const definitions = await scopeDefinitions(workspaceId, projectId);
  // El propio campo cuenta aunque aun no exista: asi una formula que se nombra
  // a si misma da «se lee a si misma» y no «campo desconocido».
  const candidates = definitions.some((definition) => definition.key === key)
    ? definitions
    : [...definitions, { id: "", key, name, type: "formula", config: {} }];

  try {
    const formula = resolveFormulaNames(
      parseFormula(String(config.expression ?? "")),
      candidates,
    );

    const formulas = storedFormulas(definitions);
    formulas.set(key, formula);

    const cycle = findCycle(key, formulas);
    if (cycle) {
      const through =
        candidates.find((candidate) => candidate.key === cycle)?.name ?? cycle;
      throw new FormulaError(
        through === name
          ? `"${name}" cannot read itself`
          : `"${name}" ends up reading itself through "${through}"`,
      );
    }
    assertFormulaCompiles(key, formulas);

    return { ...config, expression: formatFormula(formula) };
  } catch (error) {
    if (error instanceof FormulaError) {
      throw new HTTPException(400, { message: `Formula: ${error.message}` });
    }
    throw error;
  }
}

/**
 * Impide borrar o archivar un campo que lee una formula en uso: la formula
 * quedaria vacia en todas las tareas sin que nada lo explicase.
 */
export async function assertNotReadByFormulas({
  workspaceId,
  projectId,
  key,
}: {
  workspaceId: string;
  projectId: string | null;
  key: string;
}) {
  // Un campo del espacio lo pueden leer las formulas del espacio y las de
  // cualquier proyecto; uno de proyecto, solo las de ese proyecto.
  const all = await getWorkspaceFormulaDefinitions(workspaceId);
  const readers = all.filter((definition) => {
    if (definition.key === key) return false;
    if (projectId && definition.projectId !== projectId) return false;
    try {
      return referencedKeys(
        parseStoredFormula(String(definition.config.expression ?? "")),
      ).has(key);
    } catch {
      return false;
    }
  });

  if (readers.length > 0) {
    throw new HTTPException(409, {
      message: `The calculated field "${readers[0]?.name}" reads this field: change its formula first`,
    });
  }
}

async function getWorkspaceFormulaDefinitions(workspaceId: string) {
  return db
    .select()
    .from(fieldDefinitionTable)
    .where(
      and(
        eq(fieldDefinitionTable.workspaceId, workspaceId),
        eq(fieldDefinitionTable.type, "formula"),
        isNull(fieldDefinitionTable.archivedAt),
      ),
    );
}

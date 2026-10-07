import { inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { insertProject } from "../../project/controllers/create-project";
import { finishRows, projectKey } from "../exports/servitec-finish";
import { normalizeProjectName } from "../exports/servitec-parse";
import {
  type PlannedRow,
  type ProjectChoice,
  planServitecRows,
} from "../exports/servitec-plan";
import { readSheet } from "../exports/servitec-read";
import {
  assertMappedProjects,
  importProjectRows,
} from "../exports/servitec-write";
import {
  type importTasksInTransaction,
  publishImportEvents,
} from "./import-tasks";

// Importar la hoja de SERVITEC (ADR 069): el cuadro historico hecho a mano y
// la ida y vuelta de la exportacion. Reutiliza el nucleo del importador de
// Excel por proyecto, dentro de una sola transaccion para todo el libro.

class DryRun extends Error {
  constructor(readonly report: ServitecReport) {
    super("dry run");
  }
}

type ProjectOutcome = {
  name: string;
  projectId: string | null;
  created: number;
  updated: number;
  failed: number;
  /** En un ensayo, filas que irian a un proyecto que aun no existe. */
  pending: number;
};

export type ServitecReport = {
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  commentsAdded: number;
  commentsKept: number;
  projects: ProjectOutcome[];
  failures: Array<{ row: number; error: string }>;
};

export async function importServitec({
  workspaceId,
  currentUserId,
  buffer,
  choices,
  dryRun,
}: {
  workspaceId: string;
  currentUserId: string;
  buffer: Buffer;
  /** Que hacer con cada PROYECTO que no existe, por su nombre. */
  choices: Record<string, ProjectChoice>;
  dryRun: boolean;
}): Promise<ServitecReport> {
  const planned = await planServitecRows(workspaceId, await readSheet(buffer));
  const choiceOf = (name: string) =>
    Object.entries(choices).find(
      ([key]) => normalizeProjectName(key) === normalizeProjectName(name),
    )?.[1];

  const unresolved = [
    ...new Set(
      planned
        .filter((row) => !row.projectId && !choiceOf(row.proyecto))
        .map((row) => row.proyecto),
    ),
  ];
  if (unresolved.length > 0) {
    throw new HTTPException(400, {
      message: `Choose what to do with these projects: ${unresolved.join(", ")}`,
    });
  }

  await assertMappedProjects(workspaceId, choices);
  const report: ServitecReport = {
    dryRun,
    rows: planned.length,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    commentsAdded: 0,
    commentsKept: 0,
    projects: [],
    failures: [],
  };

  // Las filas de cada proyecto; las de un proyecto por crear, aparte.
  const groups = new Map<string, PlannedRow[]>();
  const toCreate = new Map<string, PlannedRow[]>();
  for (const row of planned) {
    const choice = row.projectId ? null : choiceOf(row.proyecto);
    if (choice?.action === "skip") {
      report.skipped += 1;
      continue;
    }
    const target =
      row.projectId ?? (choice?.action === "map" ? choice.projectId : null);
    const bucket = target ? groups : toCreate;
    const key = target ?? normalizeProjectName(row.proyecto);
    bucket.set(key, [...(bucket.get(key) ?? []), row]);
  }

  // Un proyecto nuevo se crea antes, fuera de la transaccion: el nucleo lee sus
  // columnas con su propia conexion. Si la importacion falla, se borra.
  const createdProjects: string[] = [];
  if (!dryRun) {
    for (const rows of toCreate.values()) {
      const name = rows[0]?.proyecto ?? "";
      const project = await db.transaction((tx) =>
        insertProject(tx, {
          workspaceId,
          name,
          icon: "Folder",
          slug: projectKey(name),
        }),
      );
      if (!project) throw new Error("Failed to create project");
      createdProjects.push(project.id);
      groups.set(project.id, rows);
    }
  } else {
    for (const rows of toCreate.values()) {
      report.projects.push({
        name: rows[0]?.proyecto ?? "",
        projectId: null,
        created: 0,
        updated: 0,
        failed: 0,
        pending: rows.length,
      });
    }
  }

  let createdTasks: Awaited<
    ReturnType<typeof importTasksInTransaction>
  >["created"] = [];
  try {
    await db.transaction(async (tx) => {
      // En orden estable de id: dos importaciones a la vez toman los cerrojos
      // de arbol en el mismo orden y no se bloquean entre si.
      for (const projectId of [...groups.keys()].sort()) {
        const rows = groups.get(projectId) ?? [];
        const { project, outcome } = await importProjectRows(tx, {
          projectId,
          rows,
          currentUserId,
        });
        createdTasks = [...createdTasks, ...outcome.created];
        await finishRows(tx, {
          rows,
          results: outcome.report.results.rows,
          currentUserId,
          report,
        });
        report.projects.push({
          name: project.name,
          projectId,
          created: outcome.report.results.created,
          updated: outcome.report.results.updated,
          failed: outcome.report.results.failed,
          pending: 0,
        });
      }
      if (dryRun) throw new DryRun(report);
    });
  } catch (error) {
    if (error instanceof DryRun) return error.report;
    if (createdProjects.length > 0) {
      await db
        .delete(projectTable)
        .where(inArray(projectTable.id, createdProjects));
    }
    throw error;
  }

  publishImportEvents(createdTasks, currentUserId);
  return report;
}

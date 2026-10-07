import { eq } from "drizzle-orm";
import { taskTable } from "../../database/schema";
import type { importTasksInTransaction, Tx } from "../controllers/import-tasks";
import { insertSheetComments } from "./servitec-comments";
import type { PlannedRow } from "./servitec-plan";

export type ServitecTotals = {
  created: number;
  updated: number;
  failed: number;
  commentsAdded: number;
  commentsKept: number;
  failures: Array<{ row: number; error: string }>;
};

/** Lo que el nucleo no sabe: la fecha de alta de la hoja y sus comentarios. */
export async function finishRows(
  tx: Tx,
  {
    rows,
    results,
    currentUserId,
    report,
  }: {
    rows: PlannedRow[];
    results: Awaited<
      ReturnType<typeof importTasksInTransaction>
    >["report"]["results"]["rows"];
    currentUserId: string;
    report: ServitecTotals;
  },
) {
  const done: Array<{ row: PlannedRow; taskId: string }> = [];
  for (const result of results) {
    const row = rows[result.index];
    if (!row) continue;
    if (result.outcome === "failed") {
      report.failed += 1;
      report.failures.push({ row: row.row, error: result.error });
      continue;
    }
    report[result.outcome] += 1;
    done.push({ row, taskId: result.taskId });
    // La fecha de alta es la de la hoja, solo al crear: la de una tarea que ya
    // existe es la suya.
    if (result.outcome === "created" && row.fecha) {
      await tx
        .update(taskTable)
        .set({ createdAt: new Date(row.fecha.getTime() + 12 * 3_600_000) })
        .where(eq(taskTable.id, result.taskId));
    }
  }

  const comments = await insertSheetComments(tx, {
    currentUserId,
    tasks: done.map(({ row, taskId }) => ({
      taskId,
      comments: row.comentarios,
      fallback: row.fecha ?? new Date(),
    })),
  });
  report.commentsAdded += comments.added;
  report.commentsKept += comments.kept;
}

/** La clave de un proyecto nuevo: sus iniciales, como la propone la web. */
export function projectKey(name: string) {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const key =
    words.length === 1
      ? (words[0] ?? "").slice(0, 3)
      : words
          .slice(0, 3)
          .map((word) => word[0])
          .join("");
  return key || "PRY";
}

import { and, eq, inArray } from "drizzle-orm";
import { activityTable } from "../../database/schema";
import { parseServerDay } from "../../utils/day-boundaries";
import { richTextToPlainText } from "../../utils/rich-text-to-plain-text";
import type { Tx } from "../controllers/import-tasks";
import { formatSheetDateIso } from "../exchange/sheet-dates";
import type { ServitecComment } from "./servitec-parse";

/** Como se firma en la actividad un comentario que llego por la hoja. */
const SHEET_AUTHOR = "Hoja SERVITEC";

const comparable = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Un parrafo por linea, como lo guarda el editor. */
const toHtml = (text: string) =>
  text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

/**
 * Los comentarios de la hoja, en `activity` y sin eventos ni avisos: miles de
 * comentarios historicos no son miles de novedades (como los de GitHub).
 *
 * **No se repite** uno que la tarea ya tenga del mismo dia con el mismo texto,
 * comparado en texto plano. Asi la vuelta de una hoja exportada no duplica los
 * comentarios que salieron de Riuna, y subir dos veces el cuadro historico
 * tampoco.
 */
export async function insertSheetComments(
  tx: Tx,
  {
    tasks,
    currentUserId,
  }: {
    tasks: ReadonlyArray<{
      taskId: string;
      comments: readonly ServitecComment[];
      fallback: Date;
    }>;
    currentUserId: string;
  },
) {
  const withComments = tasks.filter((task) => task.comments.length > 0);
  if (withComments.length === 0) return { added: 0, kept: 0 };

  const existing = await tx
    .select({
      taskId: activityTable.taskId,
      content: activityTable.content,
      createdAt: activityTable.createdAt,
    })
    .from(activityTable)
    .where(
      and(
        inArray(
          activityTable.taskId,
          withComments.map((task) => task.taskId),
        ),
        eq(activityTable.type, "comment"),
      ),
    );
  const seen = new Set(
    existing.map(
      (row) =>
        `${row.taskId}|${formatSheetDateIso(row.createdAt)}|${comparable(richTextToPlainText(row.content))}`,
    ),
  );

  const rows: (typeof activityTable.$inferInsert)[] = [];
  let kept = 0;
  for (const task of withComments) {
    task.comments.forEach((comment, order) => {
      const day = formatSheetDateIso(comment.fecha ?? task.fallback);
      const key = `${task.taskId}|${day}|${comparable(comment.texto)}`;
      if (seen.has(key)) {
        kept += 1;
        return;
      }
      seen.add(key);
      rows.push({
        taskId: task.taskId,
        type: "comment",
        userId: currentUserId,
        content: toHtml(comment.texto),
        externalSource: "servitec",
        externalUserName: SHEET_AUTHOR,
        // A mediodia de su dia, en orden: el dia es lo unico que dice la hoja.
        createdAt: new Date(
          parseServerDay(day, "fecha").getTime() + 12 * 3_600_000 + order,
        ),
      });
    });
  }

  for (let start = 0; start < rows.length; start += 500) {
    await tx.insert(activityTable).values(rows.slice(start, start + 500));
  }
  return { added: rows.length, kept };
}

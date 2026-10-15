import { and, eq, inArray } from "drizzle-orm";
import db from "../database";
import {
  projectTable,
  taskTable,
  wikiLinkTable,
  wikiPageTable,
} from "../database/schema";
import type { DbOrTx } from "../task/controllers/assignees";
import { log } from "../utils/log";

// Los enlaces entre paginas y tareas (ADR 092) salen del propio Markdown: una
// ficha de tarea (`<riuna-issue-link … task-id="…">`) dentro de una pagina, o
// una ficha de pagina (`<riuna-page-link page-id="…">`) en la descripcion de
// una tarea. Se guardan en `wiki_link` al escribir, para no buscarlos con
// `LIKE` en cada descripcion al leer.

function attribute(tag: string, name: string) {
  return new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? "";
}

// La ruta de una tarea en la web. Una URL suelta tambien enlaza: el editor la
// convierte en ficha al pegarla, pero lo que llega por la API o el MCP no pasa
// por el editor.
const TASK_ROUTE =
  /\/dashboard\/workspace\/[^/\s"<>()]+\/project\/[^/\s"<>()]+\/task\/([A-Za-z0-9_-]+)/g;

/** Las tareas que enlaza un texto: fichas, por su id o su URL, y URLs sueltas. */
export function linkedTaskIds(markdown: string | null | undefined) {
  const ids = new Set<string>();
  for (const tag of markdown?.match(/<(?:riuna|kaneo)-issue-link\b[^>]*>/gi) ??
    []) {
    const id =
      attribute(tag, "task-id") ||
      /\/task\/([A-Za-z0-9_-]+)/.exec(attribute(tag, "url"))?.[1] ||
      "";
    if (id) ids.add(id);
  }
  for (const match of markdown?.matchAll(TASK_ROUTE) ?? []) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}

/** Las paginas que enlaza un texto. */
export function linkedPageIds(markdown: string | null | undefined) {
  const ids = new Set<string>();
  for (const tag of markdown?.match(/<riuna-page-link\b[^>]*>/gi) ?? []) {
    const id = attribute(tag, "page-id");
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Rehace lo que enlaza una pagina. Solo cuentan tareas de su espacio. */
export async function syncPageLinks(
  executor: DbOrTx,
  page: { id: string; workspaceId: string },
  content: string,
) {
  await executor
    .delete(wikiLinkTable)
    .where(
      and(eq(wikiLinkTable.pageId, page.id), eq(wikiLinkTable.source, "page")),
    );
  const ids = linkedTaskIds(content);
  if (ids.length === 0) return;

  const tasks = await executor
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        inArray(taskTable.id, ids),
        eq(projectTable.workspaceId, page.workspaceId),
      ),
    );
  if (tasks.length === 0) return;

  await executor
    .insert(wikiLinkTable)
    .values(
      tasks.map((task) => ({
        pageId: page.id,
        taskId: task.id,
        source: "page",
      })),
    )
    .onConflictDoNothing();
}

/**
 * Rehace las paginas que enlaza la descripcion de una tarea. Va despues de
 * guardarla y nunca la tumba: un enlace sin anotar es un fallo menor que una
 * descripcion perdida.
 */
export async function syncTaskLinks(taskId: string, description: string) {
  try {
    await db
      .delete(wikiLinkTable)
      .where(
        and(eq(wikiLinkTable.taskId, taskId), eq(wikiLinkTable.source, "task")),
      );
    const ids = linkedPageIds(description);
    if (ids.length === 0) return;

    const pages = await db
      .select({ id: wikiPageTable.id })
      .from(wikiPageTable)
      .innerJoin(
        projectTable,
        eq(projectTable.workspaceId, wikiPageTable.workspaceId),
      )
      .innerJoin(taskTable, eq(taskTable.projectId, projectTable.id))
      .where(and(inArray(wikiPageTable.id, ids), eq(taskTable.id, taskId)));
    if (pages.length === 0) return;

    await db
      .insert(wikiLinkTable)
      .values(
        pages.map((page) => ({ pageId: page.id, taskId, source: "task" })),
      )
      .onConflictDoNothing();
  } catch (error) {
    log.error("No se pudieron anotar los enlaces a la wiki", error, { taskId });
  }
}

import { asc, eq, sql } from "drizzle-orm";
import type { Content } from "pdfmake/interfaces";
import getComments from "../comment/controllers/get-comments";
import db from "../database";
import {
  columnTable,
  labelTable,
  taskTable,
  timeEntryTable,
  userTable,
} from "../database/schema";
import { getFieldDefinitionsForProject } from "../field/controllers/get-field-definitions";
import getTask from "../task/controllers/get-task";
import { PRIORITY_LABELS } from "../task/exchange/format";
import { richTextToPlainText } from "../utils/rich-text-to-plain-text";
import { memberNames, projectContext, taskKey } from "./context";
import {
  dataTable,
  definitionList,
  muted,
  paragraph,
  pdfDocument,
  sectionTitle,
} from "./document";
import {
  fileSafe,
  formatDay,
  formatFieldValue,
  formatHours,
  formatRange,
} from "./format";

/**
 * Una tarea en PDF (ADR 091): su ficha con los campos, la descripcion, las
 * subtareas directas y los comentarios, en el orden de la maqueta.
 */
export async function buildTaskPdf(taskId: string, author: string) {
  const task = await getTask(taskId);
  const project = await projectContext(task.projectId);

  const [definitions, names, labels, logged, children, comments, columns] =
    await Promise.all([
      getFieldDefinitionsForProject(project.workspaceId, task.projectId),
      memberNames(project.workspaceId),
      db
        .select({ name: labelTable.name })
        .from(labelTable)
        .where(eq(labelTable.taskId, taskId)),
      db
        .select({
          seconds: sql<number>`coalesce(sum(${timeEntryTable.duration}), 0)::int`,
        })
        .from(timeEntryTable)
        .where(eq(timeEntryTable.taskId, taskId)),
      db
        .select({
          number: taskTable.number,
          title: taskTable.title,
          status: taskTable.status,
          startDate: taskTable.startDate,
          dueDate: taskTable.dueDate,
          estimate: taskTable.estimate,
          assigneeName: userTable.name,
        })
        .from(taskTable)
        .leftJoin(userTable, eq(taskTable.userId, userTable.id))
        .where(eq(taskTable.parentId, taskId))
        .orderBy(asc(taskTable.position)),
      getComments(taskId),
      db
        .select({ slug: columnTable.slug, name: columnTable.name })
        .from(columnTable)
        .where(eq(columnTable.projectId, task.projectId)),
    ]);

  const statusName = (slug: string) =>
    slug === "archived"
      ? "Archivada"
      : (columns.find((column) => column.slug === slug)?.name ?? slug);
  const key = taskKey(project.slug, task.number);
  const values = (task.customFields ?? {}) as Record<string, unknown>;
  const branch = task.subtree;

  const facts: Array<[string, string]> = [
    ["Asignados", task.assignees.map((person) => person.name).join(", ")],
    ["Equipo", task.teamName ?? ""],
    [
      task.isMilestone ? "Hito" : "Fechas",
      `${formatRange(task.startDate, task.dueDate)}${
        task.autoDates && (task.startDate || task.dueDate)
          ? " (automáticas)"
          : ""
      }`,
    ],
    [
      "Tarea padre",
      task.parent
        ? `${taskKey(project.slug, task.parent.number)} ${task.parent.title}`
        : "",
    ],
    ["Épicas", task.epics.map((epic) => epic.name).join(", ")],
    ...definitions.map((definition): [string, string] => [
      definition.name,
      formatFieldValue(definition, values[definition.key], (id) =>
        names.get(id),
      ),
    ]),
    ["Estimado", formatHours(task.estimate)],
    ["Registrado", logged[0]?.seconds ? formatHours(logged[0].seconds) : ""],
    ["Estimado (rama)", branch ? formatHours(branch.estimateSeconds) : ""],
    ["Registrado (rama)", branch ? formatHours(branch.loggedSeconds) : ""],
  ];

  const description = richTextToPlainText(task.description).trim();
  const commentBlocks: Content[] =
    comments.length > 0
      ? comments.map(
          (comment): Content => ({
            stack: [
              {
                text: [
                  { text: comment.user.name ?? "", bold: true },
                  {
                    text: ` · ${formatDay(comment.createdAt)}`,
                    color: "#6b7280",
                  },
                ],
              },
              { text: richTextToPlainText(comment.content).trim() },
            ],
            margin: [0, 0, 0, 8],
          }),
        )
      : [muted("Sin comentarios.")];

  const document = pdfDocument({
    context: project.context,
    author,
    title: `${key} · ${task.title}`,
    subtitle: [
      statusName(task.status),
      `Prioridad ${(PRIORITY_LABELS[task.priority ?? ""] ?? task.priority ?? "").toLowerCase()}`,
      ...labels.map((label) => label.name),
    ]
      .filter(Boolean)
      .join(" · "),
    content: [
      definitionList(facts),
      ...(description
        ? [sectionTitle("Descripción"), paragraph(description)]
        : []),
      ...(children.length > 0
        ? [
            sectionTitle("Subtareas"),
            dataTable({
              columns: [
                { header: "Subtarea", width: "*" },
                { header: "Estado" },
                { header: "Asignado" },
                { header: "Fechas", noWrap: true },
                { header: "Estimado", align: "right" },
              ],
              rows: children.map((child) => [
                `${taskKey(project.slug, child.number)} ${child.title}`,
                statusName(child.status),
                child.assigneeName ?? "",
                formatRange(child.startDate, child.dueDate),
                formatHours(child.estimate),
              ]),
            }),
          ]
        : []),
      sectionTitle("Comentarios"),
      ...commentBlocks,
    ],
  });

  return {
    document,
    filename: `${key}-${fileSafe(task.title)}.pdf`,
  };
}

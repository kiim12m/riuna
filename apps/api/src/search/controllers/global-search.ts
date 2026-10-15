import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  columnTable,
  projectTable,
  taskTable,
  userTable,
  wikiPageTable,
  workspaceTable,
  workspaceUserTable,
} from "../../database/schema";
import { richTextToPlainText } from "../../utils/rich-text-to-plain-text";
import { escapeLikePattern } from "../like-pattern";
import { TASK_SHORT_ID_PATTERN } from "../task-short-id";

type SearchParams = {
  query: string;
  userEmail?: string;
  userId?: string;
  type?:
    | "all"
    | "tasks"
    | "projects"
    | "workspaces"
    | "comments"
    | "activities"
    | "wiki";
  workspaceId?: string;
  projectId?: string;
  limit?: number;
};

type SearchResult = {
  id: string;
  type: "task" | "project" | "workspace" | "comment" | "activity" | "wiki_page";
  title: string;
  description?: string;
  content?: string;
  projectId?: string;
  projectName?: string;
  workspaceId?: string;
  workspaceName?: string;
  userId?: string;
  userName?: string;
  createdAt: Date;
  relevanceScore: number;
  taskNumber?: number;
  projectSlug?: string;
  priority?: string;
  status?: string;
  /** El nombre de la columna del proyecto que tiene ese estado, si lo hay. */
  statusName?: string;
};

/**
 * El nombre de la columna que tiene el estado de la tarea. El estado es el
 * `slug` de la columna de su proyecto (`to-do`), y lo que se lee es el nombre
 * (`Por hacer`). Subconsulta y no `JOIN`: `column` no tiene unicidad por
 * `(proyecto, slug)`, y un duplicado repetiria el resultado. Un estado que no
 * es columna —`planned`, `archived`— queda sin nombre.
 */
const statusNameOf = sql<string | null>`(
  SELECT ${columnTable.name} FROM ${columnTable}
  WHERE ${columnTable.projectId} = ${taskTable.projectId}
    AND ${columnTable.slug} = ${taskTable.status}
  ORDER BY ${columnTable.position}
  LIMIT 1
)`.as("statusName");

function toDisplayCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getActivitySearchContent(
  type: string,
  content: string | null,
  eventData: unknown,
) {
  if (content) return content;
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return undefined;
  }

  const data = eventData as Record<string, unknown>;

  switch (type) {
    case "status_changed":
      return `changed status from ${toDisplayCase(String(data.oldStatus ?? ""))} to ${toDisplayCase(String(data.newStatus ?? ""))}`;
    case "priority_changed":
      return `changed priority from ${toDisplayCase(String(data.oldPriority ?? ""))} to ${toDisplayCase(String(data.newPriority ?? ""))}`;
    case "unassigned":
      return "unassigned the task";
    case "assignee_changed":
      return data.isSelfAssigned
        ? "assigned the task to themselves"
        : `assigned the task to ${String(data.newAssignee ?? "someone")}`;
    case "due_date_changed":
      if (!data.newDueDate) {
        return "cleared the due date";
      }
      if (!data.oldDueDate) {
        return `set due date to ${String(data.newDueDate)}`;
      }
      return `changed due date from ${String(data.oldDueDate)} to ${String(data.newDueDate)}`;
    case "title_changed":
      return `changed title from "${String(data.oldTitle ?? "")}" to "${String(data.newTitle ?? "")}"`;
    case "task":
      return "created the task";
    default:
      return undefined;
  }
}

async function globalSearch(params: SearchParams): Promise<{
  results: SearchResult[];
  totalCount: number;
  searchQuery: string;
}> {
  const {
    query,
    userId,
    userEmail,
    type = "all",
    workspaceId,
    projectId,
    limit = 20,
  } = params;

  let resolvedUserId = userId;
  if (!resolvedUserId && userEmail) {
    const user = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, userEmail))
      .limit(1);

    if (user.length > 0 && user[0]) {
      resolvedUserId = user[0].id;
    }
  }

  if (!resolvedUserId) {
    return { results: [], totalCount: 0, searchQuery: query };
  }

  const userWorkspaces = await db
    .select({ workspaceId: workspaceUserTable.workspaceId })
    .from(workspaceUserTable)
    .where(eq(workspaceUserTable.userId, resolvedUserId));

  const accessibleWorkspaceIds = userWorkspaces
    .map((w) => w.workspaceId)
    .filter(Boolean);

  if (accessibleWorkspaceIds.length === 0) {
    return { results: [], totalCount: 0, searchQuery: query };
  }

  const results: SearchResult[] = [];
  const searchPattern = `%${query.toLowerCase()}%`;

  const workspaceFilter = workspaceId
    ? eq(projectTable.workspaceId, workspaceId)
    : inArray(projectTable.workspaceId, accessibleWorkspaceIds);

  // Check if query matches short-id pattern (e.g. "DEP-23"). `generateProjectSlug`
  // normalizes to NFKC before it stores a key, so the query is normalized too,
  // or a decomposed "ПА-23" would never reach the stored composed form.
  const shortIdMatch = query.normalize("NFKC").match(TASK_SHORT_ID_PATTERN);

  if (type === "all" || type === "tasks") {
    const seenTaskIds = new Set<string>();

    // If query matches short-id pattern, look up by project slug + task number first
    if (shortIdMatch?.[1] && shortIdMatch[2]) {
      const slug = shortIdMatch[1];
      const numberStr = shortIdMatch[2];
      const taskNumber = Number.parseInt(numberStr, 10);

      const shortIdTasks = await db
        .select({
          id: taskTable.id,
          title: taskTable.title,
          description: taskTable.description,
          projectId: taskTable.projectId,
          projectName: projectTable.name,
          projectSlug: projectTable.slug,
          workspaceId: projectTable.workspaceId,
          workspaceName: workspaceTable.name,
          userId: taskTable.userId,
          userName: userTable.name,
          createdAt: taskTable.createdAt,
          taskNumber: taskTable.number,
          priority: taskTable.priority,
          status: taskTable.status,
          statusName: statusNameOf,
        })
        .from(taskTable)
        .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .leftJoin(
          workspaceTable,
          eq(projectTable.workspaceId, workspaceTable.id),
        )
        .leftJoin(userTable, eq(taskTable.userId, userTable.id))
        .where(
          and(
            workspaceFilter,
            projectId ? eq(taskTable.projectId, projectId) : undefined,
            // A project key may hold `_`, which `ilike` reads as "any one
            // character", so `DE_-23` would also match a task in `DEP` and the
            // `limit(1)` below would pick whichever came back first. Escaping
            // keeps the case-insensitive comparison and drops the wildcards.
            ilike(projectTable.slug, escapeLikePattern(slug)),
            eq(taskTable.number, taskNumber),
          ),
        )
        .limit(1);

      for (const task of shortIdTasks) {
        seenTaskIds.add(task.id);
        results.push({
          id: task.id,
          type: "task",
          title: task.title,
          description: task.description || undefined,
          projectId: task.projectId,
          projectName: task.projectName || undefined,
          projectSlug: task.projectSlug || undefined,
          workspaceId: task.workspaceId || undefined,
          workspaceName: task.workspaceName || undefined,
          userId: task.userId || undefined,
          userName: task.userName || undefined,
          createdAt: task.createdAt,
          relevanceScore: 10, // Highest relevance for exact short-id match
          taskNumber: task.taskNumber || undefined,
          priority: task.priority || undefined,
          status: task.status,
          statusName: task.statusName ?? undefined,
        });
      }
    }

    // Also run text search for tasks
    const taskRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${taskTable.title}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${taskTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const taskQuery = db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        description: taskTable.description,
        projectId: taskTable.projectId,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        workspaceId: projectTable.workspaceId,
        workspaceName: workspaceTable.name,
        userId: taskTable.userId,
        userName: userTable.name,
        createdAt: taskTable.createdAt,
        taskNumber: taskTable.number,
        priority: taskTable.priority,
        status: taskTable.status,
        statusName: statusNameOf,
        relevanceScore: taskRelevanceScore.as("relevanceScore"),
      })
      .from(taskTable)
      .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
      .leftJoin(userTable, eq(taskTable.userId, userTable.id))
      .where(
        and(
          workspaceFilter,
          projectId ? eq(taskTable.projectId, projectId) : undefined,
          or(
            ilike(taskTable.title, searchPattern),
            ilike(taskTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(taskRelevanceScore), desc(taskTable.createdAt))
      .limit(limit);

    const tasks = await taskQuery;

    for (const task of tasks) {
      if (seenTaskIds.has(task.id)) continue;
      results.push({
        id: task.id,
        type: "task",
        title: task.title,
        description: task.description || undefined,
        projectId: task.projectId,
        projectName: task.projectName || undefined,
        projectSlug: task.projectSlug || undefined,
        workspaceId: task.workspaceId || undefined,
        workspaceName: task.workspaceName || undefined,
        userId: task.userId || undefined,
        userName: task.userName || undefined,
        createdAt: task.createdAt,
        relevanceScore: task.relevanceScore,
        taskNumber: task.taskNumber || undefined,
        priority: task.priority || undefined,
        status: task.status,
        statusName: task.statusName ?? undefined,
      });
    }
  }

  if (type === "all" || type === "projects") {
    const projectRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${projectTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${projectTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const projectQuery = db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        description: projectTable.description,
        slug: projectTable.slug,
        workspaceId: projectTable.workspaceId,
        workspaceName: workspaceTable.name,
        createdAt: projectTable.createdAt,
        relevanceScore: projectRelevanceScore.as("relevanceScore"),
      })
      .from(projectTable)
      .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
      .where(
        and(
          workspaceFilter,
          // Las Bandejas no salen como proyectos (ADR 051); sus tareas, si.
          isNull(projectTable.ownerUserId),
          or(
            ilike(projectTable.name, searchPattern),
            ilike(projectTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(projectRelevanceScore), desc(projectTable.createdAt))
      .limit(limit);

    const projects = await projectQuery;

    for (const project of projects) {
      results.push({
        id: project.id,
        type: "project",
        title: project.name,
        description: project.description || undefined,
        projectId: project.id,
        projectSlug: project.slug || undefined,
        workspaceId: project.workspaceId,
        workspaceName: project.workspaceName || undefined,
        createdAt: project.createdAt,
        relevanceScore: project.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "workspaces") {
    const workspaceRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${workspaceTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${workspaceTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const workspaceQuery = db
      .select({
        id: workspaceTable.id,
        name: workspaceTable.name,
        description: workspaceTable.description,
        createdAt: workspaceTable.createdAt,
        relevanceScore: workspaceRelevanceScore.as("relevanceScore"),
      })
      .from(workspaceTable)
      .leftJoin(
        workspaceUserTable,
        eq(workspaceTable.id, workspaceUserTable.workspaceId),
      )
      .where(
        and(
          inArray(workspaceTable.id, accessibleWorkspaceIds),
          or(
            ilike(workspaceTable.name, searchPattern),
            ilike(workspaceTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(workspaceRelevanceScore), desc(workspaceTable.createdAt))
      .limit(limit);

    const workspaces = await workspaceQuery;

    for (const workspace of workspaces) {
      results.push({
        id: workspace.id,
        type: "workspace",
        title: workspace.name,
        description: workspace.description || undefined,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        createdAt: workspace.createdAt,
        relevanceScore: workspace.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "comments" || type === "activities") {
    const searchableActivityText = sql<string>`COALESCE(${activityTable.content}, CAST(${activityTable.eventData} AS text), '')`;
    const activityRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${searchableActivityText}) LIKE ${searchPattern} THEN 2
        WHEN LOWER(${taskTable.title}) LIKE ${searchPattern} THEN 1
        ELSE 1
      END
    `;

    const activityQuery = db
      .select({
        id: activityTable.id,
        type: activityTable.type,
        content: activityTable.content,
        eventData: activityTable.eventData,
        taskId: activityTable.taskId,
        taskTitle: taskTable.title,
        taskNumber: taskTable.number,
        projectId: projectTable.id,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        workspaceId: projectTable.workspaceId,
        workspaceName: workspaceTable.name,
        userId: activityTable.userId,
        userName: userTable.name,
        createdAt: activityTable.createdAt,
        relevanceScore: activityRelevanceScore.as("relevanceScore"),
      })
      .from(activityTable)
      .leftJoin(taskTable, eq(activityTable.taskId, taskTable.id))
      .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
      .leftJoin(userTable, eq(activityTable.userId, userTable.id))
      .where(
        and(
          workspaceFilter,
          projectId ? eq(taskTable.projectId, projectId) : undefined,
          or(
            ilike(searchableActivityText, searchPattern),
            ilike(taskTable.title, searchPattern),
          ),
          type === "comments" ? eq(activityTable.type, "comment") : undefined,
        ),
      )
      .orderBy(desc(activityRelevanceScore), desc(activityTable.createdAt))
      .limit(limit);

    const activities = await activityQuery;

    for (const activity of activities) {
      const isComment = activity.type === "comment";
      const activityContent = getActivitySearchContent(
        activity.type,
        activity.content,
        activity.eventData,
      );
      results.push({
        id: activity.id,
        type: isComment ? "comment" : "activity",
        title: isComment
          ? `Comment on ${activity.taskTitle || "task"}`
          : `${activity.type} on ${activity.taskTitle || "task"}`,
        content: activityContent,
        projectId: activity.projectId || undefined,
        projectName: activity.projectName || undefined,
        projectSlug: activity.projectSlug || undefined,
        workspaceId: activity.workspaceId || undefined,
        workspaceName: activity.workspaceName || undefined,
        userId: activity.userId || undefined,
        userName: activity.userName || undefined,
        createdAt: activity.createdAt,
        relevanceScore: activity.relevanceScore,
        taskNumber: activity.taskNumber || undefined,
      });
    }
  }

  // Las paginas de la wiki (ADR 092): las del espacio y las de los proyectos.
  // Dentro de un proyecto, las suyas y las del espacio.
  if (type === "all" || type === "wiki") {
    const wikiRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${wikiPageTable.title}) LIKE ${searchPattern} THEN 3
        ELSE 1
      END
    `;

    const pages = await db
      .select({
        id: wikiPageTable.id,
        title: wikiPageTable.title,
        content: wikiPageTable.content,
        projectId: wikiPageTable.projectId,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        workspaceId: wikiPageTable.workspaceId,
        workspaceName: workspaceTable.name,
        updatedAt: wikiPageTable.updatedAt,
        relevanceScore: wikiRelevanceScore.as("relevanceScore"),
      })
      .from(wikiPageTable)
      .leftJoin(projectTable, eq(wikiPageTable.projectId, projectTable.id))
      .leftJoin(
        workspaceTable,
        eq(wikiPageTable.workspaceId, workspaceTable.id),
      )
      .where(
        and(
          workspaceId
            ? eq(wikiPageTable.workspaceId, workspaceId)
            : inArray(wikiPageTable.workspaceId, accessibleWorkspaceIds),
          projectId
            ? or(
                isNull(wikiPageTable.projectId),
                eq(wikiPageTable.projectId, projectId),
              )
            : undefined,
          or(
            ilike(wikiPageTable.title, searchPattern),
            ilike(wikiPageTable.content, searchPattern),
          ),
        ),
      )
      .orderBy(desc(wikiRelevanceScore), desc(wikiPageTable.updatedAt))
      .limit(limit);

    for (const page of pages) {
      results.push({
        id: page.id,
        type: "wiki_page",
        title: page.title,
        content: richTextToPlainText(page.content).slice(0, 200) || undefined,
        projectId: page.projectId || undefined,
        projectName: page.projectName || undefined,
        projectSlug: page.projectSlug || undefined,
        workspaceId: page.workspaceId,
        workspaceName: page.workspaceName || undefined,
        createdAt: page.updatedAt,
        relevanceScore: page.relevanceScore,
      });
    }
  }

  results.sort((a, b) => {
    if (a.relevanceScore !== b.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const finalResults = results.slice(0, limit);

  return {
    results: finalResults,
    totalCount: results.length,
    searchQuery: query,
  };
}

export default globalSearch;

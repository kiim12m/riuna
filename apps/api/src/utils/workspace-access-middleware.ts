import { and, eq, inArray } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { log } from "./log";
import { validateWorkspaceAccess } from "./validate-workspace-access";

type WorkspaceIdSource =
  | { type: "query"; key: string }
  | { type: "body"; key: string }
  | { type: "param"; key: string }
  | {
      type: "lookup";
      resource:
        | "project"
        | "task"
        | "label"
        | "timeEntry"
        | "activity"
        | "comment"
        | "column"
        | "workflowRule"
        | "automation"
        | "announcement"
        | "wikiPage"
        | "cycle"
        | "recurrence"
        | "template"
        | "epic"
        | "fieldDefinition"
        | "view"
        | "dashboard"
        | "dashboardWidget"
        | "goal"
        | "goalTarget";
      idKey: string;
    }
  | {
      type: "lookupMany";
      resource: "task";
      idKey: string;
    };

type WorkspaceAccessMiddlewareConfig = {
  sources: WorkspaceIdSource[];
};

async function readJsonObjectBody(
  c: Context,
): Promise<Record<string, unknown>> {
  const raw = (await c.req.json().catch(() => ({}))) || {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

export function workspaceAccessMiddleware(
  config: WorkspaceAccessMiddlewareConfig,
) {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    let workspaceId: string | null = null;

    for (const source of config.sources) {
      if (source.type === "query") {
        workspaceId = c.req.query(source.key) || null;
      } else if (source.type === "body") {
        const body = await readJsonObjectBody(c);
        const bodyValue = body[source.key];
        workspaceId = typeof bodyValue === "string" ? bodyValue : null;
      } else if (source.type === "param") {
        workspaceId = c.req.param(source.key) || null;
      } else if (source.type === "lookup") {
        const body = await readJsonObjectBody(c);
        const bodyId = body[source.idKey];
        const idFromBody = typeof bodyId === "string" ? bodyId : null;
        // Only accept the id from the same place the handler will read it
        // (path param or JSON body). Accepting it from the query string let a
        // caller authorize against one resource (`?taskId=<mine>`) while the
        // handler acted on another (`{"taskId": "<someone else's>"}`).
        const id = c.req.param(source.idKey) || idFromBody;
        if (id) {
          workspaceId = await lookupWorkspaceId(source.resource, id);
        }
      } else if (source.type === "lookupMany") {
        const body = await readJsonObjectBody(c);
        const ids = body[source.idKey];
        if (Array.isArray(ids)) {
          const taskIds = ids.filter(
            (id): id is string => typeof id === "string",
          );
          if (taskIds.length > 0) {
            const tasks = await db
              .select({ workspaceId: schema.projectTable.workspaceId })
              .from(schema.taskTable)
              .innerJoin(
                schema.projectTable,
                eq(schema.taskTable.projectId, schema.projectTable.id),
              )
              .where(inArray(schema.taskTable.id, taskIds));
            const workspaceIds = [
              ...new Set(tasks.map((task) => task.workspaceId)),
            ];
            if (workspaceIds.length === 0) {
              throw new HTTPException(404, { message: "No tasks found" });
            }
            if (workspaceIds.length > 1) {
              throw new HTTPException(400, {
                message: "All tasks must belong to the same workspace",
              });
            }
            workspaceId = workspaceIds[0] ?? null;
          }
        }
      }

      if (workspaceId) {
        break;
      }
    }

    if (!workspaceId) {
      throw new HTTPException(400, {
        message: "Workspace ID could not be determined",
      });
    }

    const apiKey = c.get("apiKey");
    const apiKeyId = apiKey?.id;

    await validateWorkspaceAccess(userId, workspaceId, apiKeyId);

    c.set("workspaceId", workspaceId);

    return next();
  };
}

async function lookupWorkspaceId(
  resource:
    | "project"
    | "task"
    | "label"
    | "timeEntry"
    | "activity"
    | "comment"
    | "column"
    | "workflowRule"
    | "automation"
    | "announcement"
    | "wikiPage"
    | "cycle"
    | "recurrence"
    | "template"
    | "epic"
    | "fieldDefinition"
    | "view"
    | "dashboard"
    | "dashboardWidget"
    | "goal"
    | "goalTarget",
  id: string,
): Promise<string | null> {
  try {
    switch (resource) {
      case "project": {
        const [project] = await db
          .select({ workspaceId: schema.projectTable.workspaceId })
          .from(schema.projectTable)
          .where(eq(schema.projectTable.id, id))
          .limit(1);
        return project?.workspaceId || null;
      }

      case "task": {
        const [task] = await db
          .select({
            workspaceId: schema.projectTable.workspaceId,
          })
          .from(schema.taskTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.taskTable.id, id))
          .limit(1);
        return task?.workspaceId || null;
      }

      case "view": {
        const [view] = await db
          .select({ workspaceId: schema.viewTable.workspaceId })
          .from(schema.viewTable)
          .where(eq(schema.viewTable.id, id))
          .limit(1);
        return view?.workspaceId || null;
      }
      case "dashboard": {
        const [dashboard] = await db
          .select({ workspaceId: schema.dashboardTable.workspaceId })
          .from(schema.dashboardTable)
          .where(eq(schema.dashboardTable.id, id))
          .limit(1);
        return dashboard?.workspaceId || null;
      }
      // Un widget no lleva `workspace_id`: sube por su panel, que es quien lo
      // tiene. Es la misma forma que `column` o `task`, que suben por proyecto.
      case "dashboardWidget": {
        const [widget] = await db
          .select({ workspaceId: schema.dashboardTable.workspaceId })
          .from(schema.dashboardWidgetTable)
          .innerJoin(
            schema.dashboardTable,
            eq(
              schema.dashboardWidgetTable.dashboardId,
              schema.dashboardTable.id,
            ),
          )
          .where(eq(schema.dashboardWidgetTable.id, id))
          .limit(1);
        return widget?.workspaceId || null;
      }

      case "goal": {
        const [goal] = await db
          .select({ workspaceId: schema.goalTable.workspaceId })
          .from(schema.goalTable)
          .where(eq(schema.goalTable.id, id))
          .limit(1);
        return goal?.workspaceId || null;
      }
      // Un resultado clave no lleva `workspace_id`: sube por su objetivo, que
      // es quien lo tiene.
      case "goalTarget": {
        const [target] = await db
          .select({ workspaceId: schema.goalTable.workspaceId })
          .from(schema.goalTargetTable)
          .innerJoin(
            schema.goalTable,
            eq(schema.goalTargetTable.goalId, schema.goalTable.id),
          )
          .where(eq(schema.goalTargetTable.id, id))
          .limit(1);
        return target?.workspaceId || null;
      }
      case "fieldDefinition": {
        const [definition] = await db
          .select({ workspaceId: schema.fieldDefinitionTable.workspaceId })
          .from(schema.fieldDefinitionTable)
          .where(eq(schema.fieldDefinitionTable.id, id))
          .limit(1);
        return definition?.workspaceId || null;
      }

      case "template": {
        const [row] = await db
          .select({ workspaceId: schema.templateTable.workspaceId })
          .from(schema.templateTable)
          .where(eq(schema.templateTable.id, id))
          .limit(1);
        return row?.workspaceId || null;
      }

      case "recurrence": {
        const [row] = await db
          .select({ workspaceId: schema.projectTable.workspaceId })
          .from(schema.taskRecurrenceTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.taskRecurrenceTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.taskRecurrenceTable.id, id))
          .limit(1);
        return row?.workspaceId || null;
      }

      case "cycle": {
        const [cycle] = await db
          .select({ workspaceId: schema.projectTable.workspaceId })
          .from(schema.cycleTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.cycleTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.cycleTable.id, id))
          .limit(1);
        return cycle?.workspaceId || null;
      }

      case "epic": {
        const [epic] = await db
          .select({ workspaceId: schema.projectTable.workspaceId })
          .from(schema.epicTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.epicTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.epicTable.id, id))
          .limit(1);
        return epic?.workspaceId || null;
      }

      case "label": {
        const [label] = await db
          .select({ workspaceId: schema.labelTable.workspaceId })
          .from(schema.labelTable)
          .where(eq(schema.labelTable.id, id))
          .limit(1);
        return label?.workspaceId || null;
      }

      case "timeEntry": {
        const [timeEntry] = await db
          .select({
            workspaceId: schema.projectTable.workspaceId,
          })
          .from(schema.timeEntryTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.timeEntryTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.timeEntryTable.id, id))
          .limit(1);
        return timeEntry?.workspaceId || null;
      }

      case "activity": {
        const [activity] = await db
          .select({
            workspaceId: schema.projectTable.workspaceId,
          })
          .from(schema.activityTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.activityTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.activityTable.id, id))
          .limit(1);
        return activity?.workspaceId || null;
      }

      case "comment": {
        const [comment] = await db
          .select({
            workspaceId: schema.projectTable.workspaceId,
          })
          .from(schema.activityTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.activityTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(
            and(
              eq(schema.activityTable.id, id),
              eq(schema.activityTable.type, "comment"),
            ),
          )
          .limit(1);
        return comment?.workspaceId || null;
      }

      case "column": {
        const [column] = await db
          .select({
            workspaceId: schema.projectTable.workspaceId,
          })
          .from(schema.columnTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.columnTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.columnTable.id, id))
          .limit(1);
        return column?.workspaceId || null;
      }

      case "automation": {
        const [automation] = await db
          .select({ workspaceId: schema.automationTable.workspaceId })
          .from(schema.automationTable)
          .where(eq(schema.automationTable.id, id))
          .limit(1);
        return automation?.workspaceId || null;
      }

      case "announcement": {
        const [announcement] = await db
          .select({ workspaceId: schema.announcementTable.workspaceId })
          .from(schema.announcementTable)
          .where(eq(schema.announcementTable.id, id))
          .limit(1);
        return announcement?.workspaceId || null;
      }
      case "wikiPage": {
        const [page] = await db
          .select({ workspaceId: schema.wikiPageTable.workspaceId })
          .from(schema.wikiPageTable)
          .where(eq(schema.wikiPageTable.id, id))
          .limit(1);
        return page?.workspaceId || null;
      }

      case "workflowRule": {
        const [workflowRule] = await db
          .select({
            workspaceId: schema.projectTable.workspaceId,
          })
          .from(schema.workflowRuleTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.workflowRuleTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.workflowRuleTable.id, id))
          .limit(1);
        return workflowRule?.workspaceId || null;
      }

      default:
        return null;
    }
  } catch (error) {
    log.error(`Error looking up workspaceId for ${resource}:`, error);
    return null;
  }
}

export const workspaceAccess = {
  fromQuery: (key = "workspaceId") =>
    workspaceAccessMiddleware({ sources: [{ type: "query", key }] }),

  fromBody: (key = "workspaceId") =>
    workspaceAccessMiddleware({ sources: [{ type: "body", key }] }),

  fromParam: (key = "workspaceId") =>
    workspaceAccessMiddleware({ sources: [{ type: "param", key }] }),

  fromProject: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "project", idKey }],
    }),

  fromTask: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "task", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromTaskId: (idKey = "taskId") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "task", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromTasks: (idKey = "taskIds") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookupMany", resource: "task", idKey }],
    }),

  fromView: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "view", idKey }],
    }),

  fromDashboard: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "dashboard", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromDashboardWidget: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "dashboardWidget", idKey }],
    }),

  fromGoal: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "goal", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromGoalTarget: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "goalTarget", idKey }],
    }),

  fromFieldDefinition: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "fieldDefinition", idKey }],
    }),

  fromLabel: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "label", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromTimeEntry: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "timeEntry", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromActivity: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "activity", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromComment: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "comment", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromColumn: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "column", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromAutomation: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "automation", idKey }],
    }),

  fromAnnouncement: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "announcement", idKey }],
    }),

  fromWikiPage: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "wikiPage", idKey }],
    }),

  fromWorkflowRule: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "workflowRule", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromTemplate: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "template", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromRecurrence: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "recurrence", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromCycle: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "cycle", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),

  fromEpic: (idKey = "id") =>
    workspaceAccessMiddleware({
      sources: [
        { type: "lookup", resource: "epic", idKey },
        { type: "query", key: "workspaceId" },
      ],
    }),
};

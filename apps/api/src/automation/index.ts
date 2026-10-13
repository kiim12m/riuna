import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { automationTable } from "../database/schema";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { listAutomationRuns } from "./controllers/list-automation-runs";
import { listAutomations } from "./controllers/list-automations";
import {
  archiveAutomation,
  createAutomation,
  setAutomationEnabled,
  updateAutomation,
} from "./controllers/save-automation";
import { type Action, automationInputSchema } from "./definition";
import { assignsWork, listManualActions, runManualAction } from "./manual";
import {
  leadManagesStandup,
  onlySendsStandups,
  requiredPermissions,
} from "./permissions";
// El motor se suscribe al bus al cargarse, como la actividad y los avisos.
import "./engine";

// Automatizaciones de proyecto y de espacio (Fase 8, ADR 066). El permiso
// depende de la regla —su alcance y si saca datos fuera—, asi que se comprueba
// en cada ruta con lo que la regla dice, y no con un permiso fijo.

type Variables = { userId: string; workspaceId: string };

const json = (description: string) => ({
  200: {
    description,
    content: { "application/json": { schema: resolver(v.any()) } },
  },
});

async function assertCanManage(
  c: Context,
  projectId: string | null,
  actions: readonly Pick<Action, "type">[],
  teamIds: readonly (string | null | undefined)[] = [],
) {
  if (
    await hasWorkspacePermission(c, requiredPermissions(projectId, actions))
  ) {
    return;
  }
  if (!c.get("userId"))
    throw new HTTPException(401, { message: "Unauthorized" });

  // El responsable de un departamento gestiona el envio de su stand-up, y solo
  // desde su sesion: una clave de API no lleva ese permiso (ADR 068).
  const teams = teamIds.filter((teamId): teamId is string => Boolean(teamId));
  if (!c.get("apiKey") && teams.length > 0) {
    const leads = await Promise.all(
      teams.map((teamId) =>
        leadManagesStandup({
          workspaceId: c.get("workspaceId"),
          teamId,
          userId: c.get("userId"),
          actions,
        }),
      ),
    );
    if (leads.every(Boolean)) return;
  }

  throw new HTTPException(403, { message: "Insufficient permissions" });
}

async function loadAutomation(c: Context, id: string) {
  const [row] = await db
    .select()
    .from(automationTable)
    .where(
      and(
        eq(automationTable.id, id),
        eq(automationTable.workspaceId, c.get("workspaceId")),
        isNull(automationTable.archivedAt),
      ),
    )
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Automation not found" });
  return row;
}

const idParam = v.object({ id: v.string() });

const automation = new Hono<{ Variables: Variables }>()
  .get(
    "/manual/task/:taskId",
    describeRoute({
      operationId: "listTaskManualAutomations",
      tags: ["Automations"],
      description:
        "The one-click actions a task offers right now: active rules with the `manual` trigger, of its project or its workspace, whose conditions it meets. Empty for whoever cannot edit tasks",
      responses: {
        200: {
          description: "The actions, in rule order",
          content: {
            "application/json": {
              schema: resolver(
                v.array(v.object({ id: v.string(), name: v.string() })),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      // Pulsar actua en nombre de quien pulsa: sin poder editar, no hay boton.
      if (!(await hasWorkspacePermission(c, { task: ["update"] }))) {
        return c.json([]);
      }
      return c.json(await listManualActions(c.req.valid("param").taskId));
    },
  )
  .post(
    "/manual/task/:taskId",
    describeRoute({
      operationId: "runTaskManualAutomation",
      tags: ["Automations"],
      description:
        "Press a one-click action on a task. Runs the rule's actions on your behalf: it needs task:update, and task:assign when the rule assigns. 409 when the task no longer meets its conditions",
      responses: {
        200: {
          description:
            "How the run went: `ok`, or `failed` with the action that stopped it",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  status: v.picklist(["ok", "failed", "skipped"]),
                  actions: v.array(
                    v.object({
                      id: v.string(),
                      type: v.string(),
                      status: v.picklist(["ok", "failed"]),
                      error: v.optional(v.string()),
                    }),
                  ),
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "json",
      v.object({ automationId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const { automationId } = c.req.valid("json");
      const [rule] = await db
        .select({ actions: automationTable.actions })
        .from(automationTable)
        .where(
          and(
            eq(automationTable.id, automationId),
            eq(automationTable.workspaceId, c.get("workspaceId")),
          ),
        )
        .limit(1);
      if (
        rule &&
        assignsWork(rule) &&
        !(await hasWorkspacePermission(c, { task: ["assign"] }))
      ) {
        throw new HTTPException(403, { message: "Insufficient permissions" });
      }
      const result = await runManualAction({
        automationId,
        taskId,
        userId: c.get("userId"),
      });
      return c.json(result);
    },
  )
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "listProjectAutomations",
      tags: ["Automations"],
      description: "List a project's automations, each with its last run",
      responses: json("Automations, oldest first"),
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      return c.json(
        await listAutomations({ workspaceId: c.get("workspaceId"), projectId }),
      );
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "createProjectAutomation",
      tags: ["Automations"],
      description:
        "Create a project automation. Webhook and chat actions also need workspace:manage_settings",
      responses: json("Automation created, without its secrets"),
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator("json", automationInputSchema),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const input = c.req.valid("json");
      await assertCanManage(c, projectId, input.actions);
      return c.json(
        await createAutomation({
          workspaceId: c.get("workspaceId"),
          projectId,
          input,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .get(
    "/workspace/:workspaceId",
    describeRoute({
      operationId: "listWorkspaceAutomations",
      tags: ["Automations"],
      description:
        "List the workspace-wide automations, each with its last run",
      responses: json("Automations, oldest first"),
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) =>
      c.json(
        await listAutomations({
          workspaceId: c.get("workspaceId"),
          projectId: null,
        }),
      ),
  )
  .get(
    "/workspace/:workspaceId/team/:teamId",
    describeRoute({
      operationId: "listTeamStandupAutomations",
      tags: ["Automations"],
      description:
        "List the scheduled stand-up deliveries of a team. Open to the team's lead as well as to workspace managers",
      responses: json("Automations, oldest first"),
    }),
    validator(
      "param",
      v.object({ workspaceId: v.string(), teamId: v.string() }),
    ),
    workspaceAccess.fromParam("workspaceId"),
    async (c) => {
      const { teamId } = c.req.valid("param");
      await assertCanManage(c, null, [{ type: "standup" }], [teamId]);
      return c.json(
        await listAutomations({
          workspaceId: c.get("workspaceId"),
          projectId: null,
          teamId,
        }),
      );
    },
  )
  .post(
    "/workspace/:workspaceId",
    describeRoute({
      operationId: "createWorkspaceAutomation",
      tags: ["Automations"],
      description:
        "Create an automation that acts on every project of the workspace except the personal ones",
      responses: json("Automation created, without its secrets"),
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator("json", automationInputSchema),
    workspaceAccess.fromParam("workspaceId"),
    async (c) => {
      const input = c.req.valid("json");
      await assertCanManage(c, null, input.actions, [input.teamId]);
      return c.json(
        await createAutomation({
          workspaceId: c.get("workspaceId"),
          projectId: null,
          input,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateAutomation",
      tags: ["Automations"],
      description:
        "Replace an automation. It then acts on behalf of whoever saved it, and a paused one runs again. A secret left out keeps the stored one; an empty one removes it",
      responses: json("Automation updated, without its secrets"),
    }),
    validator("param", idParam),
    validator("json", automationInputSchema),
    workspaceAccess.fromAutomation("id"),
    async (c) => {
      const row = await loadAutomation(c, c.req.valid("param").id);
      const input = c.req.valid("json");
      // Lo mas estricto de antes y de despues: quitar un webhook tambien es
      // tocar lo que sale fuera.
      await assertCanManage(
        c,
        row.projectId,
        [...(row.actions as Action[]), ...input.actions],
        [row.teamId, input.teamId],
      );
      return c.json(
        await updateAutomation({
          automation: row,
          input,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .patch(
    "/:id/enabled",
    describeRoute({
      operationId: "setAutomationEnabled",
      tags: ["Automations"],
      description:
        "Turn an automation on or off. Turning it on puts it on behalf of the caller and clears a pause",
      responses: json("Automation updated"),
    }),
    validator("param", idParam),
    validator("json", v.object({ enabled: v.boolean() })),
    workspaceAccess.fromAutomation("id"),
    async (c) => {
      const row = await loadAutomation(c, c.req.valid("param").id);
      await assertCanManage(c, row.projectId, row.actions as Action[], [
        row.teamId,
      ]);
      return c.json(
        await setAutomationEnabled({
          automation: row,
          enabled: c.req.valid("json").enabled,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "archiveAutomation",
      tags: ["Automations"],
      description: "Archive an automation; its run history is kept",
      responses: json("Automation archived"),
    }),
    validator("param", idParam),
    workspaceAccess.fromAutomation("id"),
    async (c) => {
      const row = await loadAutomation(c, c.req.valid("param").id);
      await assertCanManage(c, row.projectId, row.actions as Action[], [
        row.teamId,
      ]);
      return c.json(await archiveAutomation(row));
    },
  )
  .get(
    "/:id/runs",
    describeRoute({
      operationId: "listAutomationRuns",
      tags: ["Automations"],
      description:
        "An automation's runs, newest first: 50 by default. `limit` (1-100) sizes the page; `before` (the `startedAt` of the last one received) with `beforeId` (its `id`) asks for the next",
      responses: json("Runs, newest first"),
    }),
    validator("param", idParam),
    validator(
      "query",
      v.object({
        limit: v.optional(
          v.pipe(
            v.string(),
            v.transform(Number),
            v.integer(),
            v.minValue(1),
            v.maxValue(100),
          ),
        ),
        before: v.optional(
          v.pipe(
            v.string(),
            v.isoTimestamp(),
            v.transform((value) => new Date(value)),
          ),
        ),
        beforeId: v.optional(v.pipe(v.string(), v.maxLength(120))),
      }),
    ),
    workspaceAccess.fromAutomation("id"),
    async (c) => {
      const row = await loadAutomation(c, c.req.valid("param").id);
      // Leer pide lo mismo que listar; el de un envio del stand-up, tambien
      // a su responsable.
      const actions = row.actions as Action[];
      await assertCanManage(
        c,
        row.projectId,
        onlySendsStandups(actions) ? actions : [],
        [row.teamId],
      );
      return c.json(await listAutomationRuns(row.id, c.req.valid("query")));
    },
  );

export default automation;

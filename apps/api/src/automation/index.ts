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
import { requiredPermissions } from "./permissions";
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
) {
  if (
    await hasWorkspacePermission(c, requiredPermissions(projectId, actions))
  ) {
    return;
  }
  if (!c.get("userId"))
    throw new HTTPException(401, { message: "Unauthorized" });
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
      await assertCanManage(c, null, input.actions);
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
      await assertCanManage(c, row.projectId, [
        ...(row.actions as Action[]),
        ...input.actions,
      ]);
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
      await assertCanManage(c, row.projectId, row.actions as Action[]);
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
      await assertCanManage(c, row.projectId, row.actions as Action[]);
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
      await assertCanManage(c, row.projectId, []);
      return c.json(await listAutomationRuns(row.id, c.req.valid("query")));
    },
  );

export default automation;

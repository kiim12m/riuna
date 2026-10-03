import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  requireApiKeyScope,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { listTeamLeads, setTeamLead } from "./controllers/team-leads";

const teamLeadSchema = v.object({ teamId: v.string(), userId: v.string() });

const workspaceQuery = validator(
  "query",
  v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
);

/**
 * Quien es responsable de cada departamento (ADR 059). Aparte de `lead/` a
 * proposito: aquel modulo solo lee, y marcar a alguien es escribir.
 */
const teamLead = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listTeamLeads",
      tags: ["Teams"],
      description: "The team leads of the workspace, as team and user pairs",
      responses: {
        200: {
          description: "The team leads",
          content: {
            "application/json": { schema: resolver(v.array(teamLeadSchema)) },
          },
        },
      },
    }),
    workspaceQuery,
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ workspace: ["read"] }),
    async (c) => c.json(await listTeamLeads(c.get("workspaceId"))),
  )
  .put(
    "/",
    describeRoute({
      operationId: "setTeamLead",
      tags: ["Teams"],
      description:
        "Mark or unmark a team member as the team's lead, who can then read the plan and day closes of the rest of the team, never their private rating. Needs the permission to manage members",
      responses: {
        200: {
          description: "The updated lead flag",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ ...teamLeadSchema.entries, isLead: v.boolean() }),
              ),
            },
          },
        },
      },
    }),
    workspaceQuery,
    validator(
      "json",
      v.object({
        teamId: v.pipe(v.string(), v.minLength(1)),
        userId: v.pipe(v.string(), v.minLength(1)),
        isLead: v.boolean(),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ member: ["update"] }),
    async (c) =>
      c.json(
        await setTeamLead({
          workspaceId: c.get("workspaceId"),
          ...c.req.valid("json"),
        }),
      ),
  );

export default teamLead;

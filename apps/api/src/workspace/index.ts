import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import addWorkspaceMember from "./controllers/add-workspace-member";
import getWorkspaceMembersCtrl from "./controllers/get-workspace-members";

const httpErrorSchema = v.object({ message: v.string() });

const workspace = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/:workspaceId/members",
    describeRoute({
      operationId: "getWorkspaceMembers",
      tags: ["Workspaces"],
      description: "Get all members of a workspace",
      responses: {
        200: {
          description: "List of workspace members",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    name: v.string(),
                    email: v.string(),
                    image: v.nullable(v.string()),
                    role: v.string(),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromParam("workspaceId"),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const members = await getWorkspaceMembersCtrl(workspaceId);
      return c.json(members);
    },
  )
  .post(
    "/:workspaceId/member",
    describeRoute({
      operationId: "addWorkspaceMember",
      tags: ["Workspaces"],
      description:
        "Add a member to a workspace by email. A user who already has an account becomes a member immediately; otherwise an invitation is created so they can register, and membership is granted as soon as the account exists. Neither path needs the added user's approval",
      responses: {
        200: {
          description: "Member added, or invited when they have no account yet",
          content: {
            "application/json": {
              schema: resolver(
                v.union([
                  v.object({
                    status: v.literal("added"),
                    userId: v.string(),
                  }),
                  v.object({
                    status: v.literal("invited"),
                    invitationId: v.string(),
                  }),
                ]),
              ),
            },
          },
        },
        400: {
          description: "Validation error, or an attempt to grant `owner`",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
        403: {
          description: "Not allowed to add members to this workspace",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
        409: {
          description: "That user is already a member",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator(
      "json",
      v.object({
        email: v.pipe(v.string(), v.trim(), v.email()),
        role: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromParam("workspaceId"),
    // Mismo permiso que gobierna invitar, que es lo que este endpoint
    // sustituye. `member`y `viewer` heredan `invitation: []` de better-auth,
    // asi que quedan fuera igual que en la interfaz.
    requireWorkspacePermission({ invitation: ["create"] }),
    async (c) => {
      const { email, role } = c.req.valid("json");

      return c.json(
        await addWorkspaceMember({
          workspaceId: c.get("workspaceId"),
          email,
          role: role ?? "member",
          headers: c.req.raw.headers,
        }),
      );
    },
  );

export default workspace;

import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import getInvitationDetailsController from "./controllers/get-invitation-details";

const invitation = new Hono().get(
  "/:id",
  describeRoute({
    operationId: "getInvitationDetails",
    tags: ["Invitations"],
    description: "Get details of a specific invitation by ID",
    responses: {
      200: {
        description: "Invitation details",
        content: {
          "application/json": {
            schema: resolver(
              v.object({
                valid: v.boolean(),
                invitation: v.optional(
                  v.object({
                    id: v.string(),
                    email: v.string(),
                    workspaceName: v.string(),
                    inviterName: v.string(),
                    expiresAt: v.string(),
                    status: v.string(),
                    expired: v.boolean(),
                  }),
                ),
                error: v.optional(v.string()),
              }),
            ),
          },
        },
      },
    },
  }),
  validator("param", v.object({ id: v.string() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await getInvitationDetailsController(id);
    return c.json(result);
  },
);

export default invitation;

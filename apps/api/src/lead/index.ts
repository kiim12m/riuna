import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getMyLeads from "./controllers/get-my-leads";

const myLeadsSchema = v.array(v.object({ id: v.string(), name: v.string() }));

/**
 * Lo que lee el responsable de departamento (ADR 059), y quien es el de
 * quien mira. **Ningun endpoint de aqui escribe** -marcar a alguien es cosa
 * de `team-lead/`-, y todo pasa por `visibility.ts`. Dos pruebas de
 * arquitectura lo vigilan: `tests/api/lead-read-only.test.ts` y la de la
 * valoracion privada (ADR 054).
 */
const lead = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>().get(
  "/my-leads",
  describeRoute({
    operationId: "getMyLeads",
    tags: ["Lead"],
    description:
      "Who leads the current user in this workspace: the people who can read their plan and their day closes, never their private rating",
    responses: {
      200: {
        description: "The current user's leads",
        content: { "application/json": { schema: resolver(myLeadsSchema) } },
      },
    },
  }),
  validator(
    "query",
    v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
  ),
  workspaceAccess.fromQuery(),
  async (c) =>
    c.json(
      await getMyLeads({
        workspaceId: c.get("workspaceId"),
        userId: c.get("userId"),
      }),
    ),
);

export default lead;

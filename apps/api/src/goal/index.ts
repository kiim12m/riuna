import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { validateAndParseDate } from "../utils/validate-dates";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getGoals from "./controllers/get-goals";
import {
  createGoal,
  createTarget,
  deleteGoal,
  deleteTarget,
  updateGoal,
  updateTarget,
} from "./controllers/write-goal";
import { requireGoalOwner, requireTargetOwner } from "./require-goal-owner";
import { targetConfigSchema } from "./target-config";

const nameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
const targetValueSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

const ok = (description: string) => ({
  200: {
    description,
    content: { "application/json": { schema: resolver(v.any()) } },
  },
});

/**
 * Objetivos con periodo y resultados clave. Fase 7, rebanada 3.
 *
 * **El progreso no se guarda: se mide al leer**, con el mismo `aggregate()` que
 * alimenta los widgets del panel. Es lo que hace que "avanza al cerrar tareas"
 * no necesite ni disparador ni recalculo programado — cerrar una tarea mueve
 * `completed_at`, y la siguiente lectura ya cuenta distinto.
 *
 * Se gobiernan por propiedad, igual que paneles y vistas, y por el mismo motivo
 * no estrenan recurso en `@riuna/permissions`. Ver `require-goal-owner.ts`.
 */
const goal = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listGoals",
      tags: ["Goals"],
      description:
        "List the current user's goals in a workspace, each key result carrying its measured progress",
      responses: ok("The user's goals with live progress"),
    }),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromQuery(),
    async (c) => {
      const { workspaceId } = c.req.valid("query");
      return c.json(await getGoals(workspaceId, c.get("userId")));
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createGoal",
      tags: ["Goals"],
      description: "Create a goal with a period",
      responses: ok("Goal created"),
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.pipe(v.string(), v.minLength(1)),
        name: nameSchema,
        description: v.optional(v.nullable(v.string())),
        startsAt: v.string(),
        endsAt: v.string(),
      }),
    ),
    workspaceAccess.fromBody(),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createGoal({
          workspaceId: body.workspaceId,
          userId: c.get("userId"),
          name: body.name,
          description: body.description,
          startsAt: validateAndParseDate(body.startsAt, "startsAt"),
          endsAt: validateAndParseDate(body.endsAt, "endsAt"),
        }),
      );
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateGoal",
      tags: ["Goals"],
      description:
        "Rename a goal, move its period, or share it with the workspace",
      responses: ok("Goal updated"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(nameSchema),
        description: v.optional(v.nullable(v.string())),
        startsAt: v.optional(v.string()),
        endsAt: v.optional(v.string()),
        isShared: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromGoal(),
    requireGoalOwner,
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await updateGoal(id, {
          ...(body.isShared !== undefined && { isShared: body.isShared }),
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && {
            description: body.description,
          }),
          ...(body.startsAt !== undefined && {
            startsAt: validateAndParseDate(body.startsAt, "startsAt"),
          }),
          ...(body.endsAt !== undefined && {
            endsAt: validateAndParseDate(body.endsAt, "endsAt"),
          }),
        }),
      );
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteGoal",
      tags: ["Goals"],
      description: "Delete a goal and its key results",
      responses: ok("Goal deleted"),
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromGoal(),
    requireGoalOwner,
    async (c) => c.json(await deleteGoal(c.req.valid("param").id)),
  )
  .post(
    "/:id/target",
    describeRoute({
      operationId: "createGoalTarget",
      tags: ["Goals"],
      description: "Add a key result to a goal",
      responses: ok("Key result created"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: nameSchema,
        targetValue: targetValueSchema,
        projectId: v.optional(v.nullable(v.string())),
        config: v.optional(targetConfigSchema),
      }),
    ),
    workspaceAccess.fromGoal(),
    requireGoalOwner,
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await createTarget({
          goalId: id,
          name: body.name,
          targetValue: body.targetValue,
          projectId: body.projectId,
          config: body.config ?? {},
        }),
      );
    },
  )
  .patch(
    "/target/:id",
    describeRoute({
      operationId: "updateGoalTarget",
      tags: ["Goals"],
      description: "Change a key result's name, target or query",
      responses: ok("Key result updated"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(nameSchema),
        targetValue: v.optional(targetValueSchema),
        projectId: v.optional(v.nullable(v.string())),
        config: v.optional(targetConfigSchema),
      }),
    ),
    workspaceAccess.fromGoalTarget(),
    requireTargetOwner,
    async (c) =>
      c.json(await updateTarget(c.req.valid("param").id, c.req.valid("json"))),
  )
  .delete(
    "/target/:id",
    describeRoute({
      operationId: "deleteGoalTarget",
      tags: ["Goals"],
      description: "Delete a key result",
      responses: ok("Key result deleted"),
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromGoalTarget(),
    requireTargetOwner,
    async (c) => c.json(await deleteTarget(c.req.valid("param").id)),
  );

export default goal;

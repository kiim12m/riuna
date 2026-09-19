import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { validateAndParseDate } from "../utils/validate-dates";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import closeCycle from "./controllers/close-cycle";
import createCycle from "./controllers/create-cycle";
import deleteCycle from "./controllers/delete-cycle";
import getCycleReport, {
  getVelocityHistory,
} from "./controllers/get-cycle-report";
import getCycles from "./controllers/get-cycles";
import updateCycle from "./controllers/update-cycle";
import updateTaskCycle from "./controllers/update-task-cycle";

/**
 * Los ciclos viven dentro de un proyecto y se gobiernan con el permiso del
 * proyecto, igual que las epicas: quien puede cambiar sus columnas puede
 * cambiar sus sprints. Meter una tarea en un ciclo, en cambio, es editar la
 * tarea.
 */
const cycle = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "listCycles",
      tags: ["Cycles"],
      description: "List the cycles of a project with their task counts",
      responses: {
        200: {
          description: "Cycles ordered by start date",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "query",
      v.optional(v.object({ includeClosed: v.optional(v.string()) })),
    ),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const includeClosed = c.req.query("includeClosed") !== "false";
      return c.json(await getCycles(projectId, includeClosed));
    },
  )
  .get(
    "/project/:projectId/velocity",
    describeRoute({
      operationId: "getVelocityHistory",
      tags: ["Cycles"],
      description:
        "Velocity of the most recently closed cycles, oldest first, for the trend chart",
      responses: {
        200: {
          description: "Velocity per closed cycle",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      return c.json(await getVelocityHistory(projectId));
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "createCycle",
      tags: ["Cycles"],
      description: "Create a cycle inside a project",
      responses: {
        200: {
          description: "Cycle created successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
        goal: v.optional(v.nullable(v.string())),
        startDate: v.string(),
        endDate: v.string(),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await createCycle({
          projectId,
          name: body.name,
          goal: body.goal,
          startDate: validateAndParseDate(body.startDate, "startDate"),
          endDate: validateAndParseDate(body.endDate, "endDate"),
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .get(
    "/:id/report",
    describeRoute({
      operationId: "getCycleReport",
      tags: ["Cycles"],
      description:
        "Velocity, burndown and logged hours per person for one cycle",
      responses: {
        200: {
          description: "The cycle report",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromCycle("id"),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await getCycleReport(id));
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateCycle",
      tags: ["Cycles"],
      description:
        "Update a cycle, or move it between planned and active. Closing goes through /close.",
      responses: {
        200: {
          description: "Cycle updated successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(120))),
        goal: v.optional(v.nullable(v.string())),
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        status: v.optional(v.picklist(["planned", "active"])),
      }),
    ),
    workspaceAccess.fromCycle("id"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await updateCycle({
          cycleId: id,
          name: body.name,
          goal: body.goal,
          startDate: body.startDate
            ? validateAndParseDate(body.startDate, "startDate")
            : undefined,
          endDate: body.endDate
            ? validateAndParseDate(body.endDate, "endDate")
            : undefined,
          status: body.status,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/close",
    describeRoute({
      operationId: "closeCycle",
      tags: ["Cycles"],
      description:
        "Close a cycle and either send its unfinished tasks back to the backlog or move them to another cycle",
      responses: {
        200: {
          description: "Cycle closed successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        unfinished: v.picklist(["backlog", "cycle"]),
        targetCycleId: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromCycle("id"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await closeCycle({
          cycleId: id,
          unfinished: body.unfinished,
          targetCycleId: body.targetCycleId,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteCycle",
      tags: ["Cycles"],
      description: "Delete a cycle; its tasks go back to the backlog",
      responses: {
        200: {
          description: "Cycle deleted successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromCycle("id"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await deleteCycle(id, c.get("userId")));
    },
  )
  .put(
    "/task/:taskId",
    describeRoute({
      operationId: "updateTaskCycle",
      tags: ["Cycles"],
      description: "Put a task into a cycle, or take it out with a null id",
      responses: {
        200: {
          description: "Task cycle updated successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator("json", v.object({ cycleId: v.nullable(v.string()) })),
    workspaceAccess.fromTask("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const { cycleId } = c.req.valid("json");

      return c.json(
        await updateTaskCycle({
          taskId,
          cycleId,
          currentUserId: c.get("userId"),
        }),
      );
    },
  );

export default cycle;

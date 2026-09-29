import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { timeEntrySchema } from "../schemas";
import {
  requireApiKeyScope,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createTimeEntry from "./controllers/create-time-entry";
import deleteTimeEntry from "./controllers/delete-time-entry";
import getRunningTimeEntry from "./controllers/get-running-time-entry";
import getTimeEntriesByTaskId from "./controllers/get-time-entries";
import getTimeEntry from "./controllers/get-time-entry";
import startTimer from "./controllers/start-timer";
import stopTimer from "./controllers/stop-timer";
import updateTimeEntry from "./controllers/update-time-entry";
// Registra el cierre automatico al terminar la tarea (ADR 044) como efecto
// de cargar el modulo, igual que `notification/index.ts` con
// `time-entry.created`: no hace falta llamarlo desde aqui, solo importarlo.
import "./stop-on-done";

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

function isIsoTimestamp(value: string) {
  if (!ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

const timestamp = v.pipe(
  v.string(),
  v.check(isIsoTimestamp, "Expected an ISO 8601 timestamp"),
);

const runningTaskSchema = v.object({
  id: v.string(),
  number: v.nullable(v.number()),
  title: v.string(),
  projectId: v.string(),
  estimate: v.nullable(v.number()),
});

const lastEntrySchema = v.object({
  id: v.string(),
  taskId: v.string(),
  startTime: v.date(),
  endTime: v.nullable(v.date()),
  taskTitle: v.string(),
  taskNumber: v.nullable(v.number()),
  projectId: v.string(),
});

const runningTimeEntryResponseSchema = v.object({
  running: v.nullable(
    v.object({
      id: v.string(),
      startTime: v.date(),
      task: v.optional(runningTaskSchema),
      loggedBeforeSeconds: v.number(),
    }),
  ),
  last: v.nullable(lastEntrySchema),
});

const timeEntry = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/running",
    describeRoute({
      operationId: "getRunningTimeEntry",
      tags: ["Time Entries"],
      description:
        "The current user's running time entry, if any, plus the last entry to offer as a resume target when nothing is running",
      responses: {
        200: {
          description: "The current tracking state",
          content: {
            "application/json": {
              schema: resolver(runningTimeEntryResponseSchema),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { workspaceId } = c.req.valid("query");
      const userId = c.get("userId");
      const state = await getRunningTimeEntry({ userId, workspaceId });
      return c.json(state);
    },
  )
  .post(
    "/start",
    describeRoute({
      operationId: "startTimer",
      tags: ["Time Entries"],
      description:
        "Start tracking time on a task. Stops whatever the user was tracking before (one timer per person, ADR 044)",
      responses: {
        200: {
          description: "The running time entry",
          content: {
            "application/json": { schema: resolver(timeEntrySchema) },
          },
        },
      },
    }),
    validator("json", v.object({ taskId: v.string() })),
    workspaceAccess.fromTaskId(),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const { taskId } = c.req.valid("json");
      const userId = c.get("userId");
      const started = await startTimer({ taskId, userId });
      return c.json(started);
    },
  )
  .post(
    "/stop",
    describeRoute({
      operationId: "stopTimer",
      tags: ["Time Entries"],
      description: "Stop the current user's running time entry",
      responses: {
        200: {
          description: "The closed time entry",
          content: {
            "application/json": { schema: resolver(timeEntrySchema) },
          },
        },
      },
    }),
    validator("json", v.object({ endTime: v.optional(timestamp) })),
    async (c) => {
      const { endTime } = c.req.valid("json");
      const userId = c.get("userId");
      const stopped = await stopTimer({
        userId,
        endTime: endTime ? new Date(endTime) : undefined,
      });
      return c.json(stopped);
    },
  )
  .get(
    "/task/:taskId",
    describeRoute({
      operationId: "getTaskTimeEntries",
      tags: ["Time Entries"],
      description: "Get all time entries for a specific task",
      responses: {
        200: {
          description: "List of time entries for the task",
          content: {
            "application/json": { schema: resolver(v.array(timeEntrySchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    workspaceAccess.fromTaskId(),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const timeEntries = await getTimeEntriesByTaskId(taskId);
      return c.json(timeEntries);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getTimeEntry",
      tags: ["Time Entries"],
      description: "Get a specific time entry by ID",
      responses: {
        200: {
          description: "Time entry details",
          content: {
            "application/json": { schema: resolver(timeEntrySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromTimeEntry(),
    async (c) => {
      const { id } = c.req.valid("param");
      const timeEntry = await getTimeEntry(id);
      return c.json(timeEntry);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createTimeEntry",
      tags: ["Time Entries"],
      description: "Create a new time entry for a task",
      responses: {
        200: {
          description: "Time entry created successfully",
          content: {
            "application/json": { schema: resolver(timeEntrySchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        taskId: v.string(),
        startTime: timestamp,
        endTime: v.optional(timestamp),
        description: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromTaskId(),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const { taskId, startTime, endTime, description } = c.req.valid("json");
      const userId = c.get("userId");
      const timeEntry = await createTimeEntry({
        taskId,
        userId,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : undefined,
        description,
      });
      return c.json(timeEntry);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateTimeEntry",
      tags: ["Time Entries"],
      description: "Update an existing time entry (owner only)",
      responses: {
        200: {
          description: "Time entry updated successfully",
          content: {
            "application/json": { schema: resolver(timeEntrySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        startTime: timestamp,
        endTime: v.optional(timestamp),
        description: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromTimeEntry(),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { startTime, endTime, description } = c.req.valid("json");
      const userId = c.get("userId");
      const timeEntry = await updateTimeEntry({
        timeEntryId: id,
        userId,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : undefined,
        description,
      });
      return c.json(timeEntry);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteTimeEntry",
      tags: ["Time Entries"],
      description: "Delete a time entry (owner only)",
      responses: {
        200: {
          description: "Time entry deleted successfully",
          content: {
            "application/json": { schema: resolver(timeEntrySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromTimeEntry(),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const userId = c.get("userId");
      const timeEntry = await deleteTimeEntry(userId, id);
      return c.json(timeEntry);
    },
  );

export default timeEntry;

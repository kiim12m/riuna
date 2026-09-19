import { addDays, isSameDay, max, startOfDay } from "date-fns";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { taskRecurrenceTable } from "../database/schema";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { validateAndParseDate } from "../utils/validate-dates";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { firstOnOrAfter, parseCadence } from "./cadence";
import { countGeneratedTasks } from "./generate";
import { assertTemplateUsable, parseTemplate } from "./template";

/** Las excepciones de `parseCadence`/`parseTemplate` son errores de quien llama. */
function asBadRequest<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : "Invalid payload",
    });
  }
}

const recurrence = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "listTaskRecurrences",
      tags: ["Recurrences"],
      description: "List the recurring tasks configured in a project",
      responses: {
        200: {
          description: "Recurrences ordered by next run",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");

      return c.json(
        await db
          .select({
            id: taskRecurrenceTable.id,
            projectId: taskRecurrenceTable.projectId,
            template: taskRecurrenceTable.template,
            cadence: taskRecurrenceTable.cadence,
            nextRunAt: taskRecurrenceTable.nextRunAt,
            lastRunAt: taskRecurrenceTable.lastRunAt,
            endsAt: taskRecurrenceTable.endsAt,
            active: taskRecurrenceTable.active,
            createdAt: taskRecurrenceTable.createdAt,
            generatedCount: countGeneratedTasks(),
          })
          .from(taskRecurrenceTable)
          .where(eq(taskRecurrenceTable.projectId, projectId))
          .orderBy(asc(taskRecurrenceTable.nextRunAt)),
      );
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "createTaskRecurrence",
      tags: ["Recurrences"],
      description: "Create a recurring task in a project",
      responses: {
        200: {
          description: "Recurrence created successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "json",
      v.object({
        template: v.record(v.string(), v.unknown()),
        cadence: v.record(v.string(), v.unknown()),
        startsAt: v.string(),
        endsAt: v.optional(v.nullable(v.string())),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      const cadence = asBadRequest(() => parseCadence(body.cadence));
      const template = asBadRequest(() => parseTemplate(body.template));
      await assertTemplateUsable(template, projectId);
      const startsAt = validateAndParseDate(body.startsAt, "startsAt");
      const endsAt = body.endsAt
        ? validateAndParseDate(body.endsAt, "endsAt")
        : null;

      // La primera ocurrencia es el primer dia de la cadencia desde el inicio, y
      // nunca antes de hoy. Hoy cuenta ("toca hoy", ADR 026): una recurrencia
      // que empieza hoy genera la tarea de hoy, y con un inicio pasado no se
      // dispara una tarea por cada dia transcurrido.
      const nextRunAt = firstOnOrAfter(cadence, startsAt, new Date());

      if (endsAt && endsAt < startsAt) {
        throw new HTTPException(400, {
          message: "The end date cannot be before the start date",
        });
      }

      const [created] = await db
        .insert(taskRecurrenceTable)
        .values({
          projectId,
          createdBy: c.get("userId"),
          template,
          cadence,
          nextRunAt,
          endsAt,
        })
        .returning();

      return c.json(created);
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateTaskRecurrence",
      tags: ["Recurrences"],
      description: "Update, pause or resume a recurring task",
      responses: {
        200: {
          description: "Recurrence updated successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        template: v.optional(v.record(v.string(), v.unknown())),
        cadence: v.optional(v.record(v.string(), v.unknown())),
        endsAt: v.optional(v.nullable(v.string())),
        active: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromRecurrence("id"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const existing = await db.query.taskRecurrenceTable.findFirst({
        where: eq(taskRecurrenceTable.id, id),
      });

      if (!existing) {
        throw new HTTPException(404, { message: "Recurrence not found" });
      }

      const changes: Partial<typeof taskRecurrenceTable.$inferInsert> = {};

      if (body.template !== undefined) {
        const template = asBadRequest(() => parseTemplate(body.template));
        await assertTemplateUsable(template, existing.projectId);
        changes.template = template;
      }

      if (body.cadence !== undefined) {
        const cadence = asBadRequest(() => parseCadence(body.cadence));
        changes.cadence = cadence;
        // Cambiar la cadencia recoloca la proxima fecha aunque la vieja siga en
        // el futuro: si no, la primera ocurrencia seguiria la regla anterior.
        // Cuenta desde hoy, o desde manana si la tarea de hoy ya se genero; y
        // una recurrencia que aun no ha empezado no se adelanta a su inicio.
        const today = startOfDay(new Date());
        const floor =
          existing.lastRunAt === null
            ? max([today, existing.nextRunAt])
            : isSameDay(existing.lastRunAt, today)
              ? addDays(today, 1)
              : today;
        changes.nextRunAt = firstOnOrAfter(cadence, floor);
      }

      if (body.endsAt !== undefined) {
        changes.endsAt = body.endsAt
          ? validateAndParseDate(body.endsAt, "endsAt")
          : null;
      }

      if (body.active !== undefined) changes.active = body.active;

      if (Object.keys(changes).length === 0) return c.json(existing);

      const [updated] = await db
        .update(taskRecurrenceTable)
        .set(changes)
        .where(eq(taskRecurrenceTable.id, id))
        .returning();

      return c.json(updated);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteTaskRecurrence",
      tags: ["Recurrences"],
      description:
        "Delete a recurrence; the tasks it already generated are kept",
      responses: {
        200: {
          description: "Recurrence deleted successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromRecurrence("id"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");

      const [deleted] = await db
        .delete(taskRecurrenceTable)
        .where(eq(taskRecurrenceTable.id, id))
        .returning();

      if (!deleted) {
        throw new HTTPException(404, { message: "Recurrence not found" });
      }

      return c.json(deleted);
    },
  );

export default recurrence;

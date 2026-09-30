import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import updateWorkSchedule from "./controllers/update-work-schedule";
import { getWorkSchedule } from "./get-work-schedule";

const startMinuteSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(1439),
);
const endMinuteSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(1440),
);

const workScheduleSchema = v.object({
  workStartMinute: startMinuteSchema,
  workEndMinute: endMinuteSchema,
  lunchEnabled: v.boolean(),
  lunchStartMinute: v.nullable(startMinuteSchema),
  lunchEndMinute: v.nullable(endMinuteSchema),
  /** Mascara de 7 bits, bit 0 domingo. CHECK `user_work_schedule_work_days_valid`. */
  workDays: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127)),
});

/**
 * La jornada personal (ADR 045): fuente unica de horario y capacidad para el
 * Planificador, el Cronograma y Hoy. De quien mira, no del espacio -mismo
 * patron sin `workspaceAccess` que `notification-preferences/`-.
 */
const workSchedule = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "getWorkSchedule",
      tags: ["Work Schedule"],
      description:
        "The current user's work schedule, or the defaults if they never saved one",
      responses: {
        200: {
          description: "The work schedule",
          content: {
            "application/json": { schema: resolver(workScheduleSchema) },
          },
        },
      },
    }),
    async (c) => {
      const schedule = await getWorkSchedule(c.get("userId"));
      return c.json(schedule);
    },
  )
  .put(
    "/",
    describeRoute({
      operationId: "updateWorkSchedule",
      tags: ["Work Schedule"],
      description: "Save the current user's work schedule",
      responses: {
        200: {
          description: "The saved work schedule",
          content: {
            "application/json": { schema: resolver(workScheduleSchema) },
          },
        },
      },
    }),
    validator("json", workScheduleSchema),
    async (c) => {
      const input = c.req.valid("json");
      const updated = await updateWorkSchedule(c.get("userId"), input);
      return c.json(updated);
    },
  );

export default workSchedule;

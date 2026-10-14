import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { pdfResponse } from "../pdf/response";
import { buildTimeSheetPdf } from "../pdf/time-sheet";
import { buildContentDisposition } from "../utils/content-disposition";
import {
  addDays,
  endOfServerDay,
  parseServerDay,
  startOfServerDay,
} from "../utils/day-boundaries";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS } from "./constants";
import exportTimeSheet from "./controllers/export-time-sheet";
import getTimeSheet from "./controllers/get-time-sheet";

const querySchema = v.object({
  workspaceId: v.pipe(v.string(), v.minLength(1)),
  start: v.optional(v.string()),
  end: v.optional(v.string()),
  groupBy: v.optional(v.picklist(["day", "task", "project"]), "day"),
});

/**
 * Resuelve la ventana: por defecto los ultimos 7 dias hasta hoy, o el rango
 * explicito acotado a MAX_RANGE_DAYS.
 */
function resolveWindow(start?: string, end?: string) {
  if (!start && !end) {
    const windowEnd = endOfServerDay(new Date());
    const windowStart = startOfServerDay(
      addDays(windowEnd, -(DEFAULT_RANGE_DAYS - 1)),
    );
    return { windowStart, windowEnd };
  }

  if (!start || !end) {
    throw new HTTPException(400, {
      message: "Give both start and end, or neither",
    });
  }

  const windowStart = parseServerDay(start, "start");
  const windowEnd = endOfServerDay(parseServerDay(end, "end"));

  if (windowEnd < windowStart) {
    throw new HTTPException(400, {
      message: "end cannot be before start",
    });
  }

  const rangeDays =
    (windowEnd.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new HTTPException(400, {
      message: `The range must not exceed ${MAX_RANGE_DAYS} days`,
    });
  }

  return { windowStart, windowEnd };
}

/**
 * El parte de horas de quien mira, cruzando proyectos (ADR 042). Plano,
 * fuera de `time-entry/`: es una lectura transversal, no un metodo mas del
 * recurso que registra y edita entradas por tarea.
 */
const timeSheet = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "getTimeSheet",
      tags: ["Time Sheet"],
      description:
        "The current user's time entries across the workspace, grouped by day, task or project",
      responses: {
        200: {
          description: "Time sheet for the requested range",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("query", querySchema),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { workspaceId, start, end, groupBy } = c.req.valid("query");
      const { windowStart, windowEnd } = resolveWindow(start, end);

      const result = await getTimeSheet({
        workspaceId,
        userId: c.get("userId"),
        windowStart,
        windowEnd,
        groupBy,
      });

      return c.json(result);
    },
  )
  .get(
    "/export",
    describeRoute({
      operationId: "exportTimeSheet",
      tags: ["Time Sheet"],
      description:
        "Export the time sheet for the requested range as a spreadsheet or, with `format=pdf`, as a document with every entry, the total, each day against the work schedule and room for two signatures (ADR 091)",
      responses: {
        200: {
          description: "Spreadsheet or PDF file",
          content: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              { schema: { type: "string", format: "binary" } },
            "application/pdf": { schema: { type: "string", format: "binary" } },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        ...querySchema.entries,
        format: v.optional(v.picklist(["xlsx", "pdf"]), "xlsx"),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { workspaceId, start, end, groupBy, format } = c.req.valid("query");
      const { windowStart, windowEnd } = resolveWindow(start, end);

      if (format === "pdf") {
        return pdfResponse(
          c,
          await buildTimeSheetPdf({
            workspaceId,
            userId: c.get("userId"),
            windowStart,
            windowEnd,
            groupBy,
          }),
        );
      }

      const { buffer, filename, contentType } = await exportTimeSheet({
        workspaceId,
        userId: c.get("userId"),
        windowStart,
        windowEnd,
        groupBy,
      });

      return c.body(new Uint8Array(buffer), 200, {
        "Content-Disposition": buildContentDisposition(filename, false),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      });
    },
  );

export default timeSheet;

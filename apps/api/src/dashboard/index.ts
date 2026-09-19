import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { buildContentDisposition } from "../utils/content-disposition";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createDashboard from "./controllers/create-dashboard";
import createWidget from "./controllers/create-widget";
import deleteDashboard from "./controllers/delete-dashboard";
import deleteWidget from "./controllers/delete-widget";
import exportDashboard from "./controllers/export-dashboard";
import getDashboardData from "./controllers/get-dashboard-data";
import getDashboards from "./controllers/get-dashboards";
import reorderWidgets from "./controllers/reorder-widgets";
import updateDashboard from "./controllers/update-dashboard";
import updateWidget from "./controllers/update-widget";
import {
  requireDashboardOwner,
  requireDashboardVisible,
  requireWidgetOwner,
} from "./require-dashboard-owner";
import { WIDGET_TYPES, widgetConfigSchema } from "./widget-config";

const nameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
const spanSchema = v.pipe(v.number(), v.minValue(1), v.maxValue(3));

/**
 * Paneles personales. Fase 7, rebanada 1.
 *
 * **Se gobiernan por propiedad, no por el vocabulario de permisos**, igual que
 * las vistas (ADR 015): un panel no cambia ninguna tarea, solo dice como
 * mirarlas. No se anade un recurso `dashboard` a `@riuna/permissions` porque
 * toda fila de `workspace_role` ya guardada carece de el y `satisfies()`
 * devolveria falso: cada espacio con roles personalizados se quedaria con un
 * 403 el dia del despliegue.
 *
 * La lectura de datos si lleva `requireApiKeyScope({ task: ["read"] })`, por el
 * mismo razonamiento que "Mi trabajo": un gate de rol seria mas estricto que el
 * tablero que resume, pero sin ningun gate se apagaria de paso la unica
 * comprobacion del alcance de las claves de API, y una clave emitida para un
 * script de informes podria enumerar el trabajo de todo el espacio.
 */
const dashboard = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listDashboards",
      tags: ["Dashboards"],
      description: "List the current user's dashboards in a workspace",
      responses: {
        200: {
          description: "The user's dashboards, each with its widgets",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromQuery(),
    async (c) => {
      const { workspaceId } = c.req.valid("query");
      return c.json(await getDashboards(workspaceId, c.get("userId")));
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createDashboard",
      tags: ["Dashboards"],
      description: "Create a personal dashboard in a workspace",
      responses: {
        200: {
          description: "Dashboard created",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.pipe(v.string(), v.minLength(1)),
        name: nameSchema,
      }),
    ),
    workspaceAccess.fromBody(),
    async (c) => {
      const { workspaceId, name } = c.req.valid("json");
      return c.json(
        await createDashboard({ workspaceId, userId: c.get("userId"), name }),
      );
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateDashboard",
      tags: ["Dashboards"],
      description: "Rename, reposition or share a dashboard",
      responses: {
        200: {
          description: "Dashboard updated",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(nameSchema),
        position: v.optional(v.number()),
        isShared: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromDashboard("id"),
    requireDashboardOwner,
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await updateDashboard(id, c.req.valid("json")));
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteDashboard",
      tags: ["Dashboards"],
      description: "Delete a dashboard and its widgets",
      responses: {
        200: {
          description: "Dashboard deleted",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDashboard("id"),
    requireDashboardOwner,
    async (c) => c.json(await deleteDashboard(c.req.valid("param").id)),
  )
  .post(
    "/:id/data",
    describeRoute({
      operationId: "getDashboardData",
      tags: ["Dashboards"],
      description:
        "Compute every widget of a dashboard in one request. A widget that fails carries its own error instead of failing the whole panel",
      responses: {
        200: {
          description: "One entry per widget, with data or an error",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDashboard("id"),
    // Leer, no escribir: un panel compartido lo ve todo el espacio.
    requireDashboardVisible,
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(
        await getDashboardData(id, c.get("workspaceId"), c.get("userId")),
      );
    },
  )
  .get(
    "/:id/export",
    describeRoute({
      operationId: "exportDashboard",
      tags: ["Dashboards"],
      description:
        "Export a dashboard as a spreadsheet, one sheet per widget. Only xlsx: a CSV is one table and a dashboard is several",
      responses: {
        200: {
          description: "Spreadsheet file",
          content: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              { schema: { type: "string", format: "binary" } },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDashboard("id"),
    requireDashboardVisible,
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");

      const { buffer, filename, contentType } = await exportDashboard(
        id,
        c.get("workspaceId"),
        c.get("userId"),
      );

      // Sin `Content-Length`: el `compress()` global puede recodificar el
      // cuerpo, y una longitud obsoleta es peor que ninguna.
      return c.body(new Uint8Array(buffer), 200, {
        "Content-Disposition": buildContentDisposition(filename, false),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      });
    },
  )
  .post(
    "/:id/widget",
    describeRoute({
      operationId: "createWidget",
      tags: ["Dashboards"],
      description: "Add a widget to a dashboard",
      responses: {
        200: {
          description: "Widget created",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        type: v.picklist(WIDGET_TYPES),
        title: nameSchema,
        projectId: v.optional(v.nullable(v.string())),
        goalId: v.optional(v.nullable(v.string())),
        config: widgetConfigSchema,
        span: v.optional(spanSchema),
      }),
    ),
    workspaceAccess.fromDashboard("id"),
    requireDashboardOwner,
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await createWidget({
          dashboardId: id,
          workspaceId: c.get("workspaceId"),
          ...body,
        }),
      );
    },
  )
  .patch(
    "/widget/:id",
    describeRoute({
      operationId: "updateWidget",
      tags: ["Dashboards"],
      description: "Change a widget's title, scope, configuration or width",
      responses: {
        200: {
          description: "Widget updated",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        title: v.optional(nameSchema),
        projectId: v.optional(v.nullable(v.string())),
        goalId: v.optional(v.nullable(v.string())),
        config: v.optional(widgetConfigSchema),
        span: v.optional(spanSchema),
      }),
    ),
    workspaceAccess.fromDashboardWidget("id"),
    requireWidgetOwner,
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(
        await updateWidget({
          id,
          workspaceId: c.get("workspaceId"),
          ...c.req.valid("json"),
        }),
      );
    },
  )
  .delete(
    "/widget/:id",
    describeRoute({
      operationId: "deleteWidget",
      tags: ["Dashboards"],
      description: "Remove a widget from its dashboard",
      responses: {
        200: {
          description: "Widget deleted",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDashboardWidget("id"),
    requireWidgetOwner,
    async (c) => c.json(await deleteWidget(c.req.valid("param").id)),
  )
  .put(
    "/:id/widget/order",
    describeRoute({
      operationId: "reorderWidgets",
      tags: ["Dashboards"],
      description: "Set the order of a dashboard's widgets",
      responses: {
        200: {
          description: "Widgets reordered",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({ widgetIds: v.pipe(v.array(v.string()), v.maxLength(50)) }),
    ),
    workspaceAccess.fromDashboard("id"),
    requireDashboardOwner,
    async (c) => {
      const { id } = c.req.valid("param");
      const { widgetIds } = c.req.valid("json");
      return c.json(await reorderWidgets(id, widgetIds));
    },
  );

export default dashboard;

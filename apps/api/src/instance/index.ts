import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import * as v from "valibot";
import { assertInstanceAdmin } from "../utils/instance-admin";
import { HEALTH_PROBLEM_KINDS } from "./health";
import { buildInstanceReport } from "./report";

const isoOrNull = v.nullable(v.string());

const instanceReportSchema = v.object({
  generatedAt: v.string(),
  version: v.nullable(v.string()),
  /** El commit con el que se construyó la imagen, si se selló. */
  revision: v.nullable(v.string()),
  startedAt: v.string(),
  uptimeSeconds: v.number(),
  node: v.string(),
  timeZone: v.string(),
  schedulerEnabled: v.boolean(),
  rateLimitEnabled: v.boolean(),
  database: v.object({
    sizeBytes: v.number(),
    version: v.nullable(v.string()),
    appliedMigrations: v.nullable(v.number()),
    bundledMigrations: v.nullable(v.number()),
  }),
  jobs: v.array(
    v.object({
      job: v.string(),
      lastStatus: v.string(),
      lastStartedAt: isoOrNull,
      lastFinishedAt: isoOrNull,
      lastDurationMs: v.number(),
      lastSuccessAt: isoOrNull,
      consecutiveFailures: v.number(),
      lastError: v.nullable(v.string()),
    }),
  ),
  backups: v.object({
    /** Si hay directorio de copias (`BACKUP_DIR`). */
    configured: v.boolean(),
    /** Si la API lo puede leer. Definido e ilegible es un problema. */
    readable: v.boolean(),
    latest: v.nullable(
      v.object({
        file: v.string(),
        createdAt: v.string(),
        sizeBytes: v.number(),
      }),
    ),
    count: v.number(),
    offsite: v.nullable(
      v.object({
        status: v.string(),
        checkedAt: isoOrNull,
        lastSuccessAt: isoOrNull,
        latest: v.nullable(v.string()),
        remoteCount: v.nullable(v.number()),
        message: v.nullable(v.string()),
      }),
    ),
  }),
  realtime: v.object({
    redis: v.boolean(),
    connections: v.object({ users: v.number(), projects: v.number() }),
  }),
  requests: v.object({
    /** Los 5xx desde que arrancó el proceso. */
    serverErrors: v.number(),
    /** Las rutas más lentas por p95, desde que arrancó el proceso. */
    slowest: v.array(
      v.object({
        method: v.string(),
        route: v.string(),
        count: v.number(),
        errors: v.number(),
        p50: v.number(),
        p95: v.number(),
      }),
    ),
  }),
  /**
   * Lo que está mal ahora mismo, se haya avisado ya o no. `kind` y `params`
   * son para traducirlo; `message` es el mismo texto, en español.
   */
  problems: v.array(
    v.object({
      key: v.string(),
      kind: v.picklist(HEALTH_PROBLEM_KINDS),
      params: v.record(v.string(), v.union([v.string(), v.number()])),
      message: v.string(),
    }),
  ),
  /** Las alertas abiertas, de las que ya se avisó. */
  alerts: v.array(
    v.object({ key: v.string(), message: v.string(), openedAt: v.string() }),
  ),
  /** La IP con la que la API ve a quien pregunta. */
  you: v.object({ ip: v.nullable(v.string()) }),
});

const instance = new Hono<{
  Variables: { userId: string; apiKey?: unknown };
}>().get(
  "/report",
  describeRoute({
    operationId: "getInstanceReport",
    tags: ["Instance"],
    description:
      "The health of this Riuna instance for its admin: version, database, scheduled jobs, backups, realtime, slow routes and open alerts. Session only",
    responses: {
      200: {
        description: "Instance report",
        content: {
          "application/json": { schema: resolver(instanceReportSchema) },
        },
      },
      403: { description: "Not the instance admin, or an API key" },
    },
  }),
  async (c) => {
    // Solo con sesión, como el enlace del calendario: una clave de API no
    // tiene alcance para lo que es de la instancia y no de un espacio.
    if (c.get("apiKey")) {
      throw new HTTPException(403, {
        message: "The instance report needs a session",
      });
    }
    await assertInstanceAdmin(c.get("userId"));
    return c.json(await buildInstanceReport(c));
  },
);

export default instance;

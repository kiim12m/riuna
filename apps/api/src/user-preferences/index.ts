import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { userPreferenceTable } from "../database/schema";

/**
 * Las preferencias de presentacion que viajan con la cuenta. Una lista cerrada
 * y no un objeto libre: es lo que se guarda en un `jsonb`, y sin ella cualquier
 * cliente podria dejar ahi lo que quisiera. El tema no esta a proposito: es del
 * dispositivo.
 */
const preferencesSchema = v.object({
  viewMode: v.picklist(["board", "list"]),
  compactMode: v.boolean(),
  showTaskNumbers: v.boolean(),
  showAssignees: v.boolean(),
  showDueDates: v.boolean(),
  showLabels: v.boolean(),
  showPriority: v.boolean(),
  sidebarDefaultOpen: v.boolean(),
  // Domingo, lunes o sabado: los tres comienzos de semana que ofrece la interfaz.
  weekStartsOn: v.picklist([0, 1, 6]),
});

const partialPreferencesSchema = v.partial(preferencesSchema);

const responseSchema = v.object({ preferences: partialPreferencesSchema });

/**
 * Las preferencias de quien mira (ADR 064): de la persona y no del espacio, el
 * mismo patron sin `workspaceAccess` que `work-schedule/`. Sin fila devuelven
 * `{}` y la interfaz sigue con lo que tuviera en el navegador.
 */
const userPreferences = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "getUserPreferences",
      tags: ["User Preferences"],
      description:
        "The current user's saved display preferences; an empty object if they never saved any",
      responses: {
        200: {
          description: "The preferences",
          content: { "application/json": { schema: resolver(responseSchema) } },
        },
      },
    }),
    async (c) => {
      const [row] = await db
        .select({ preferences: userPreferenceTable.preferences })
        .from(userPreferenceTable)
        .where(eq(userPreferenceTable.userId, c.get("userId")))
        .limit(1);

      return c.json({ preferences: row?.preferences ?? {} });
    },
  )
  .put(
    "/",
    describeRoute({
      operationId: "updateUserPreferences",
      tags: ["User Preferences"],
      description:
        "Merge the given preferences into the current user's: only the keys sent change, the rest are kept",
      responses: {
        200: {
          description: "The preferences after the merge",
          content: { "application/json": { schema: resolver(responseSchema) } },
        },
      },
    }),
    validator("json", partialPreferencesSchema),
    async (c) => {
      const incoming = c.req.valid("json");
      const userId = c.get("userId");

      // La fusion en SQL, sobre lo que haya en ese momento: dos dispositivos
      // que cambian preferencias distintas a la vez no se pisan.
      const [row] = await db
        .insert(userPreferenceTable)
        .values({ userId, preferences: incoming })
        .onConflictDoUpdate({
          target: userPreferenceTable.userId,
          set: {
            preferences: sql`${userPreferenceTable.preferences} || ${JSON.stringify(incoming)}::jsonb`,
          },
        })
        .returning({ preferences: userPreferenceTable.preferences });

      return c.json({ preferences: row?.preferences ?? incoming });
    },
  );

export default userPreferences;

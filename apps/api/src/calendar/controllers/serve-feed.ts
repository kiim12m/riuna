import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  calendarFeedTable,
  userTable,
  workspaceTable,
  workspaceUserTable,
} from "../../database/schema";
import { buildCalendar } from "../feed-events";
import { FEED_TOKEN_PATTERN, hashFeedToken } from "../token";

const CACHE_MS = 5 * 60 * 1000;
const MAX_CACHED = 500;

/**
 * Lo generado, cinco minutos por enlace: es tambien el limite de cada uno,
 * como mucho una generacion cada cinco minutos por instancia (ADR 057).
 */
const cache = new Map<string, { body: string; expiresAt: number }>();

/**
 * El `.ics` de un token, o `null` si no vale. Se busca el enlace en cada
 * peticion, antes de la cache: un token revocado o regenerado, o el de
 * alguien que ya no esta en el espacio, deja de servir al momento.
 */
export default async function serveFeed(
  token: string,
  now = new Date(),
): Promise<string | null> {
  if (!FEED_TOKEN_PATTERN.test(token)) return null;

  const [feed] = await db
    .select({
      id: calendarFeedTable.id,
      workspaceId: calendarFeedTable.workspaceId,
      userId: calendarFeedTable.userId,
      workspaceName: workspaceTable.name,
      locale: userTable.locale,
    })
    .from(calendarFeedTable)
    .innerJoin(
      workspaceUserTable,
      and(
        eq(workspaceUserTable.workspaceId, calendarFeedTable.workspaceId),
        eq(workspaceUserTable.userId, calendarFeedTable.userId),
      ),
    )
    .innerJoin(
      workspaceTable,
      eq(workspaceTable.id, calendarFeedTable.workspaceId),
    )
    .innerJoin(userTable, eq(userTable.id, calendarFeedTable.userId))
    .where(eq(calendarFeedTable.tokenHash, hashFeedToken(token)))
    .limit(1);

  if (!feed) return null;

  const cached = cache.get(feed.id);
  if (cached && cached.expiresAt > now.getTime()) return cached.body;

  const body = await buildCalendar({
    workspaceId: feed.workspaceId,
    userId: feed.userId,
    name: `Riuna · ${feed.workspaceName}`,
    locale: feed.locale,
    now,
  });

  cache.delete(feed.id);
  cache.set(feed.id, { body, expiresAt: now.getTime() + CACHE_MS });
  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  return body;
}

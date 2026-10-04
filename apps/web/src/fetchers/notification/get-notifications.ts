import { client } from "@riuna/libs";

type NotificationPage = {
  /** Cuantas pedir, de 1 a 100. Sin dato, 50. */
  limit?: number;
  /** El `createdAt` de la ultima recibida: pide la pagina siguiente. */
  before?: string;
  /** El `id` de esa misma ultima: desempata las del mismo milisegundo. */
  beforeId?: string;
  unread?: boolean;
};

async function getNotifications(page: NotificationPage = {}) {
  const response = await client.notification.$get({
    query: {
      ...(page.limit ? { limit: String(page.limit) } : {}),
      ...(page.before ? { before: page.before } : {}),
      ...(page.beforeId ? { beforeId: page.beforeId } : {}),
      ...(page.unread ? { unread: "true" as const } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export async function getUnreadNotificationCount() {
  const response = await client.notification["unread-count"].$get();

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const { count } = await response.json();
  return count;
}

export default getNotifications;

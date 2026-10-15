import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

// La wiki de paginas (ADR 092).

async function unwrap<T>(response: {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }
  return response.json();
}

const api = () => client.wiki;

export async function getWikiPages(
  workspaceId: string,
  projectId: string | null,
) {
  return unwrap(
    await api().workspace[":workspaceId"].pages.$get({
      param: { workspaceId },
      query: projectId ? { projectId } : {},
    }),
  );
}

export async function getWikiPage(pageId: string) {
  return unwrap(await api().page[":id"].$get({ param: { id: pageId } }));
}

export async function createWikiPage(
  workspaceId: string,
  input: {
    title: string;
    content?: string;
    projectId?: string | null;
    parentId?: string | null;
  },
) {
  return unwrap(
    await api().workspace[":workspaceId"].pages.$post({
      param: { workspaceId },
      json: input,
    }),
  );
}

export async function saveWikiPage(
  pageId: string,
  input: {
    title: string;
    content: string;
    baseVersion: number;
    note?: string | null;
  },
) {
  return unwrap(
    await api().page[":id"].$put({ param: { id: pageId }, json: input }),
  );
}

export async function moveWikiPage(pageId: string, parentId: string | null) {
  return unwrap(
    await api().page[":id"].move.$patch({
      param: { id: pageId },
      json: { parentId },
    }),
  );
}

export async function deleteWikiPage(
  pageId: string,
  children: "lift" | "delete",
) {
  return unwrap(
    await api().page[":id"].$delete({
      param: { id: pageId },
      query: { children },
    }),
  );
}

export async function getWikiVersions(pageId: string) {
  return unwrap(
    await api().page[":id"].versions.$get({ param: { id: pageId }, query: {} }),
  );
}

export async function getWikiVersion(pageId: string, version: number) {
  return unwrap(
    await api().page[":id"].versions[":version"].$get({
      param: { id: pageId, version: String(version) },
    }),
  );
}

export async function restoreWikiVersion(
  pageId: string,
  input: { version: number; baseVersion: number },
) {
  return unwrap(
    await api().page[":id"].restore.$post({
      param: { id: pageId },
      json: input,
    }),
  );
}

export async function getTaskWikiLinks(taskId: string) {
  return unwrap(await api().task[":taskId"].links.$get({ param: { taskId } }));
}

export async function createWikiImageUpload(
  pageId: string,
  input: { filename: string; contentType: string; size: number },
) {
  return unwrap(
    await api().page[":id"]["image-upload"].$put({
      param: { id: pageId },
      json: input,
    }),
  );
}

export async function finalizeWikiImageUpload(
  pageId: string,
  input: { key: string; filename: string; contentType: string; size: number },
) {
  return unwrap(
    await api().page[":id"]["image-upload"].finalize.$post({
      param: { id: pageId },
      json: input,
    }),
  );
}

export type WikiPageSummary = Awaited<ReturnType<typeof getWikiPages>>[number];
export type WikiPage = Awaited<ReturnType<typeof getWikiPage>>;
export type WikiVersionSummary = Awaited<
  ReturnType<typeof getWikiVersions>
>[number];

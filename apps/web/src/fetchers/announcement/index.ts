import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

// Avisos de proyecto y de espacio (ADR 081).

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

/** Donde vive un aviso: un proyecto o el propio espacio. */
export type AnnouncementScope =
  | { kind: "project"; projectId: string }
  | { kind: "workspace"; workspaceId: string };

export type AnnouncementInput = {
  title: string;
  content: string;
  pinned: boolean;
  pinnedUntil: string | null;
};

export async function getAnnouncements(scope: AnnouncementScope) {
  const api = client.announcement;
  return unwrap(
    scope.kind === "project"
      ? await api.project[":projectId"].$get({
          param: { projectId: scope.projectId },
        })
      : await api.workspace[":workspaceId"].$get({
          param: { workspaceId: scope.workspaceId },
        }),
  );
}

export async function getPinnedAnnouncement(projectId: string) {
  return unwrap(
    await client.announcement.project[":projectId"].pinned.$get({
      param: { projectId },
    }),
  );
}

export async function createAnnouncement(
  scope: AnnouncementScope,
  input: AnnouncementInput & { notify: boolean },
) {
  const api = client.announcement;
  return unwrap(
    scope.kind === "project"
      ? await api.project[":projectId"].$post({
          param: { projectId: scope.projectId },
          json: input,
        })
      : await api.workspace[":workspaceId"].$post({
          param: { workspaceId: scope.workspaceId },
          json: input,
        }),
  );
}

export async function updateAnnouncement(id: string, input: AnnouncementInput) {
  return unwrap(
    await client.announcement[":id"].$put({ param: { id }, json: input }),
  );
}

export async function deleteAnnouncement(id: string) {
  return unwrap(await client.announcement[":id"].$delete({ param: { id } }));
}

export type Announcement = Awaited<ReturnType<typeof getAnnouncements>>[number];

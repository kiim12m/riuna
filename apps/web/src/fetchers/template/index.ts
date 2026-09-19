import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

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

export async function getTemplates(workspaceId: string) {
  return unwrap(
    await client.template.workspace[":workspaceId"].$get({
      param: { workspaceId },
    }),
  );
}

export async function captureTaskTemplate(
  taskId: string,
  payload: { name: string; description?: string | null },
) {
  return unwrap(
    await client.template["from-task"][":taskId"].$post({
      param: { taskId },
      json: payload,
    }),
  );
}

export async function captureProjectTemplate(
  projectId: string,
  payload: { name: string; description?: string | null },
) {
  return unwrap(
    await client.template["from-project"][":projectId"].$post({
      param: { projectId },
      json: payload,
    }),
  );
}

export async function applyTemplate(
  templateId: string,
  payload: { projectId: string; parentId?: string | null },
) {
  return unwrap(
    await client.template[":id"].apply.$post({
      param: { id: templateId },
      json: payload,
    }),
  );
}

export async function deleteTemplate(templateId: string) {
  return unwrap(
    await client.template[":id"].$delete({ param: { id: templateId } }),
  );
}

export type Template = Awaited<ReturnType<typeof getTemplates>>[number];

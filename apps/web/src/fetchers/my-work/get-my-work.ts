import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

export type MyWorkScope = "assigned" | "team";
export type MyWorkDueWindow = "all" | "overdue" | "today" | "week";

export type MyWorkParams = {
  workspaceId: string;
  scope: MyWorkScope;
  includeDone?: boolean;
  due?: MyWorkDueWindow;
  projectId?: string;
  page?: number;
  limit?: number;
};

async function getMyWork({
  workspaceId,
  scope,
  includeDone = false,
  due = "all",
  projectId,
  page = 1,
  limit = 50,
}: MyWorkParams) {
  const response = await client["my-work"].tasks.$get({
    query: {
      workspaceId,
      scope,
      includeDone: includeDone ? "true" : "false",
      due,
      ...(projectId ? { projectId } : {}),
      page: String(page),
      limit: String(limit),
    },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type MyWorkResult = Awaited<ReturnType<typeof getMyWork>>;
export type MyWorkTask = MyWorkResult["tasks"][number];

export default getMyWork;

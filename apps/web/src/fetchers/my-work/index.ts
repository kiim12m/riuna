import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

export type PersonalScope = "assigned" | "team";

export type SearchMyWorkOptions = {
  workspaceId: string;
  scope: PersonalScope;
  includeDone?: boolean;
  sortBy?: "smart" | "dueDate" | "priority";
  page?: number;
  limit?: number;
};

export async function searchMyWork({
  workspaceId,
  scope,
  includeDone = false,
  sortBy = "smart",
  page = 1,
  limit = 100,
}: SearchMyWorkOptions) {
  const response = await client["my-work"].tasks.search.$get({
    query: {
      workspaceId,
      scope,
      includeDone: includeDone ? "true" : "false",
      sortBy,
      page: String(page),
      limit: String(limit),
    },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type MyWorkTask = Awaited<
  ReturnType<typeof searchMyWork>
>["tasks"][number];

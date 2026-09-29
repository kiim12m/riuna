import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

async function deleteTimeEntry(id: string) {
  const response = await client["time-entry"][":id"].$delete({
    param: { id },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export default deleteTimeEntry;

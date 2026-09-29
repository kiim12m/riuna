import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

async function stopTimer(endTime?: string) {
  const response = await client["time-entry"].stop.$post({
    json: endTime ? { endTime } : {},
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export default stopTimer;

import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** El estado de la instancia, solo para su admin (ADR 075). */
export async function getInstanceReport() {
  const response = await client.instance.report.$get();
  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }
  return response.json();
}

export type InstanceReport = Awaited<ReturnType<typeof getInstanceReport>>;

import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncedPreferences } from "@/lib/preferences-sync";

/** Lo que el servidor devuelve: solo las claves que la persona llego a guardar. */
export async function getUserPreferences(): Promise<
  Partial<SyncedPreferences>
> {
  const response = await client["user-preferences"].$get();

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return (await response.json()).preferences as Partial<SyncedPreferences>;
}

export async function updateUserPreferences(patch: Partial<SyncedPreferences>) {
  const response = await client["user-preferences"].$put({ json: patch });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return (await response.json()).preferences;
}

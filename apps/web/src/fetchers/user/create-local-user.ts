import { client } from "@riuna/libs";

type CreateLocalUserPayload = {
  username: string;
  displayName: string;
  password: string;
  workspaceId: string;
  role: string;
};

async function createLocalUser(payload: CreateLocalUserPayload) {
  const response = await client.user.local.$post({ json: payload });

  if (!response.ok) {
    // El endpoint distingue nombre cogido (409) de datos invalidos (400) y de
    // falta de permiso (403), con el mensaje ya redactado: se muestra ese, que
    // dice mas que uno generico.
    const body = await response.text();
    let message = body;
    try {
      message = (JSON.parse(body) as { message?: string }).message ?? body;
    } catch {
      // El cuerpo no era JSON; se usa el texto tal cual.
    }
    throw new Error(message);
  }

  return response.json();
}

export default createLocalUser;

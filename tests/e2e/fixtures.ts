import { test as base, expect } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:1338";

export type RiunaContext = {
  email: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  projectSlug: string;
  /** Llama a la API con la sesion de la prueba ya puesta. */
  api: <T = unknown>(
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    body?: unknown,
  ) => Promise<T>;
};

/**
 * Cada prueba arranca con su propio usuario, espacio y proyecto, creados por la
 * API.
 *
 * Se monta por API y no por la interfaz a proposito: registrarse y crear un
 * espacio a mano en cada prueba mediria tres veces el mismo formulario y haria
 * que un fallo en el alta tumbara pruebas que van de otra cosa. Lo que cada
 * prueba verifica por pantalla es **su** gesto.
 *
 * `page.request` comparte el tarro de cookies con la pestaña, asi que al
 * terminar el montaje la sesion ya esta puesta en el navegador sin tocar
 * `storageState`.
 */
export const test = base.extend<{ riuna: RiunaContext }>({
  riuna: async ({ page, baseURL }, use) => {
    const origin = baseURL ?? "http://localhost:5174";
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = `e2e-${stamp}@example.com`;

    async function api<T>(
      method: "get" | "post" | "put" | "patch" | "delete",
      path: string,
      body?: unknown,
    ): Promise<T> {
      const response = await page.request[method](`${API_URL}${path}`, {
        // Better Auth rechaza una peticion sin `Origin`, asi que va explicito.
        headers: { "content-type": "application/json", Origin: origin },
        ...(body === undefined ? {} : { data: body }),
      });

      if (!response.ok()) {
        throw new Error(
          `${method.toUpperCase()} ${path} -> ${response.status()} ${await response.text()}`,
        );
      }

      return (await response.json()) as T;
    }

    const signUp = await api<{ user: { id: string } }>(
      "post",
      "/api/auth/sign-up/email",
      { email, password: "E2e-passw0rd!", name: "E2E" },
    );

    const workspace = await api<{ id: string }>(
      "post",
      "/api/auth/organization/create",
      { name: `E2E ${stamp}`, slug: `e2e-${stamp}` },
    );

    // El alta crea el espacio pero no lo deja activo, y la aplicacion si lo
    // deja al terminar el onboarding. Las pantallas que no llevan
    // `workspaceId` en la ruta —los ajustes de proyecto— dependen de eso, asi
    // que el montaje tiene que dejar la sesion como la dejaria la aplicacion.
    await api("post", "/api/auth/organization/set-active", {
      organizationId: workspace.id,
    });

    const projectSlug = `e2e${stamp}`;
    const project = await api<{ id: string }>("post", "/api/project", {
      name: "Proyecto E2E",
      workspaceId: workspace.id,
      icon: "Folder",
      slug: projectSlug,
    });

    await use({
      email,
      userId: signUp.user.id,
      workspaceId: workspace.id,
      projectId: project.id,
      projectSlug,
      api,
    });
  },
});

export { expect };

/** Crea una tarea por API y devuelve su id. */
export async function createTask(
  riuna: RiunaContext,
  title: string,
  extra: Record<string, unknown> = {},
) {
  const task = await riuna.api<{ id: string }>(
    "post",
    `/api/task/${riuna.projectId}`,
    {
      title,
      description: "",
      status: "to-do",
      priority: "medium",
      ...extra,
    },
  );

  return task.id;
}

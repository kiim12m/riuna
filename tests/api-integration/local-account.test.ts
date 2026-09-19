import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";

type App = ReturnType<typeof createApp>["app"];

// Estas pruebas no simulan la sesion: registran de verdad. La creacion de una
// cuenta local pasa por `auth.api.createUser`, que exige una sesion autentica
// cuando se le pasan cabeceras, y el propio hecho de que el primer registro se
// promocione a admin de instancia es lo que sostiene toda la guarda.
async function signUp(
  app: App,
  { email, password = "contrasena-de-prueba", name = "Persona" },
) {
  const response = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  const setCookie = response.headers.getSetCookie();
  const cookie = setCookie.map((entry) => entry.split(";")[0]).join("; ");

  return { response, cookie };
}

async function seedWorkspaceOwnedBy(userId: string) {
  const [workspace] = await db
    .insert(schema.workspaceTable)
    .values({
      id: `workspace-${randomUUID()}`,
      createdAt: new Date(),
      name: "Espacio de la instancia",
      slug: `workspace-${randomUUID()}`,
    })
    .returning();

  await db.insert(schema.workspaceUserTable).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
    joinedAt: new Date(),
  });

  return workspace;
}

async function createLocalAccount(
  app: App,
  cookie: string,
  body: Record<string, string>,
) {
  return app.request("/api/user/local", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

describe("API integration: local accounts", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("promotes the first signup to instance admin", async () => {
    const { app } = createApp();
    const email = `admin-${randomUUID()}@example.com`;

    const { response } = await signUp(app, { email });
    expect(response.status).toBe(200);

    const [user] = await db
      .select({ role: schema.userTable.role })
      .from(schema.userTable)
      .where(eq(schema.userTable.email, email));

    expect(user.role).toBe("admin");
  });

  it("creates the account with a synthetic address and puts it in the workspace", async () => {
    const { app } = createApp();
    const { cookie } = await signUp(app, {
      email: `admin-${randomUUID()}@example.com`,
    });

    const [admin] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable);
    const workspace = await seedWorkspaceOwnedBy(admin.id);

    const response = await createLocalAccount(app, cookie, {
      username: "marta.ruiz",
      displayName: "Marta Ruiz",
      password: "contrasena-local",
      workspaceId: workspace.id,
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      id: string;
      username: string;
      role: string;
    };
    expect(payload.username).toBe("marta.ruiz");
    expect(payload.role).toBe("member");

    const [created] = await db
      .select({
        email: schema.userTable.email,
        emailVerified: schema.userTable.emailVerified,
        username: schema.userTable.username,
        isLocalAccount: schema.userTable.isLocalAccount,
        role: schema.userTable.role,
      })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, payload.id));

    expect(created.email).toBe("marta.ruiz@local.riuna");
    expect(created.emailVerified).toBe(true);
    expect(created.username).toBe("marta.ruiz");
    expect(created.isLocalAccount).toBe(true);
    // Crear cuentas es cosa del admin de instancia, pero la cuenta creada no
    // hereda ese poder.
    expect(created.role).not.toBe("admin");

    const membership = await db
      .select({ role: schema.workspaceUserTable.role })
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspace.id),
          eq(schema.workspaceUserTable.userId, payload.id),
        ),
      );

    expect(membership).toHaveLength(1);
    expect(membership[0].role).toBe("member");

    // Sin credencial no se podria entrar, y una cuenta local no tiene otra via.
    const credentials = await db
      .select({ providerId: schema.accountTable.providerId })
      .from(schema.accountTable)
      .where(eq(schema.accountTable.userId, payload.id));

    expect(credentials.map((row) => row.providerId)).toContain("credential");
  });

  it("normalises the username to lowercase", async () => {
    const { app } = createApp();
    const { cookie } = await signUp(app, {
      email: `admin-${randomUUID()}@example.com`,
    });
    const [admin] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable);
    const workspace = await seedWorkspaceOwnedBy(admin.id);

    const response = await createLocalAccount(app, cookie, {
      username: "Marta.Ruiz",
      displayName: "Marta Ruiz",
      password: "contrasena-local",
      workspaceId: workspace.id,
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as { id: string };
    const [created] = await db
      .select({
        username: schema.userTable.username,
        email: schema.userTable.email,
      })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, payload.id));

    expect(created.username).toBe("marta.ruiz");
    expect(created.email).toBe("marta.ruiz@local.riuna");
  });

  // El nombre repetido tiene que salir como conflicto, no como un fallo de la
  // restriccion unica de la base.
  it("answers a username already taken with a 409", async () => {
    const { app } = createApp();
    const { cookie } = await signUp(app, {
      email: `admin-${randomUUID()}@example.com`,
    });
    const [admin] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable);
    const workspace = await seedWorkspaceOwnedBy(admin.id);

    const body = {
      username: "marta.ruiz",
      displayName: "Marta Ruiz",
      password: "contrasena-local",
      workspaceId: workspace.id,
    };

    expect((await createLocalAccount(app, cookie, body)).status).toBe(200);

    const repeated = await createLocalAccount(app, cookie, {
      ...body,
      displayName: "Otra Marta",
    });

    expect(repeated.status).toBe(409);

    const rows = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable)
      .where(eq(schema.userTable.username, "marta.ruiz"));

    expect(rows).toHaveLength(1);
  });

  // La arroba es lo que separa usuario de correo en el formulario de acceso.
  it("refuses a username with an at sign", async () => {
    const { app } = createApp();
    const { cookie } = await signUp(app, {
      email: `admin-${randomUUID()}@example.com`,
    });
    const [admin] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable);
    const workspace = await seedWorkspaceOwnedBy(admin.id);

    const response = await createLocalAccount(app, cookie, {
      username: "marta@ruiz",
      displayName: "Marta Ruiz",
      password: "contrasena-local",
      workspaceId: workspace.id,
    });

    expect(response.status).toBe(400);
  });

  it("refuses someone who is not the instance admin", async () => {
    const { app } = createApp();
    const { cookie: adminCookie } = await signUp(app, {
      email: `admin-${randomUUID()}@example.com`,
    });
    const [admin] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable);
    const workspace = await seedWorkspaceOwnedBy(admin.id);

    const { response: secondSignUp, cookie: memberCookie } = await signUp(app, {
      email: `member-${randomUUID()}@example.com`,
      name: "Miembro normal",
    });
    expect(secondSignUp.status).toBe(200);

    const refused = await createLocalAccount(app, memberCookie, {
      username: "colada",
      displayName: "Cuenta colada",
      password: "contrasena-local",
      workspaceId: workspace.id,
    });

    expect(refused.status).toBe(403);

    const rows = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable)
      .where(eq(schema.userTable.username, "colada"));

    expect(rows).toHaveLength(0);

    // Y el admin si puede, para que quede claro que el 403 es por el rol y no
    // porque la ruta este rota.
    const allowed = await createLocalAccount(app, adminCookie, {
      username: "colada",
      displayName: "Cuenta legitima",
      password: "contrasena-local",
      workspaceId: workspace.id,
    });

    expect(allowed.status).toBe(200);
  });

  it("stops being local once the admin gives it a real address", async () => {
    const { app } = createApp();
    const { cookie } = await signUp(app, {
      email: `admin-${randomUUID()}@example.com`,
    });
    const [admin] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable);
    const workspace = await seedWorkspaceOwnedBy(admin.id);

    const created = await createLocalAccount(app, cookie, {
      username: "marta.ruiz",
      displayName: "Marta Ruiz",
      password: "contrasena-local",
      workspaceId: workspace.id,
    });
    const { id } = (await created.json()) as { id: string };

    const response = await app.request(`/api/user/${id}/email`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ email: "marta.ruiz@empresa.example" }),
    });

    expect(response.status).toBe(200);

    const [updated] = await db
      .select({
        email: schema.userTable.email,
        username: schema.userTable.username,
        isLocalAccount: schema.userTable.isLocalAccount,
      })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, id));

    expect(updated.email).toBe("marta.ruiz@empresa.example");
    expect(updated.isLocalAccount).toBe(false);
    // El nombre de usuario se conserva: la cuenta gana una llave, no cambia
    // de llave.
    expect(updated.username).toBe("marta.ruiz");
  });

  it("refuses to hand out an address of the reserved local domain", async () => {
    const { app } = createApp();
    const { cookie } = await signUp(app, {
      email: `admin-${randomUUID()}@example.com`,
    });
    const [admin] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable);
    const workspace = await seedWorkspaceOwnedBy(admin.id);

    const created = await createLocalAccount(app, cookie, {
      username: "marta.ruiz",
      displayName: "Marta Ruiz",
      password: "contrasena-local",
      workspaceId: workspace.id,
    });
    const { id } = (await created.json()) as { id: string };

    const response = await app.request(`/api/user/${id}/email`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ email: "otra@local.riuna" }),
    });

    expect(response.status).toBe(400);

    const [unchanged] = await db
      .select({ email: schema.userTable.email })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, id));

    expect(unchanged.email).toBe("marta.ruiz@local.riuna");
  });
  // La otra mitad de la reserva. `set-user-email` ya rechazaba el dominio
  // sintetico, pero el registro no lo miraba: cualquiera podia ocupar
  // `usuario@local.riuna` y la tabla de miembros lo presentaba como una cuenta
  // creada por el admin, porque clasifica por dominio.
  it("refuses a public signup on the reserved local domain", async () => {
    const { app } = createApp();

    // Con una cuenta ya existente: la primera alta de la instancia es el
    // arranque del admin y se salta las comprobaciones de registro.
    await signUp(app, { email: `admin-${randomUUID()}@example.com` });

    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "intruso@local.riuna",
        password: "una-contrasena-larga-de-verdad",
        name: "Intruso",
      }),
    });

    expect(response.status).not.toBe(200);

    const [created] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable)
      .where(eq(schema.userTable.email, "intruso@local.riuna"));

    expect(created).toBeUndefined();
  });
});

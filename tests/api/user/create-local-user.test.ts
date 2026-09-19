import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockCreateUser = vi.fn();
const mockAddMember = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("../../../apps/api/src/auth", () => ({
  auth: {
    api: {
      createUser: (...args: unknown[]) => mockCreateUser(...args),
      addMember: (...args: unknown[]) => mockAddMember(...args),
    },
  },
}));

import createLocalUser from "../../../apps/api/src/user/controllers/create-local-user";

/**
 * `db.select().from().where().limit()` con el resultado en la llamada final.
 * El controlador hace dos consultas seguidas —rol del actor y nombre cogido—,
 * asi que las respuestas se sirven en orden.
 */
function encolarConsultas(...resultados: unknown[][]) {
  const pendientes = [...resultados];
  mockSelect.mockImplementation(() => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(pendientes.shift() ?? []),
    };
    return chain;
  });
}

const ENTRADA = {
  actorId: "user-admin",
  username: "ana.torres",
  displayName: "Ana Torres",
  password: "contrasena-larga",
  workspaceId: "ws-1",
  role: "member",
  headers: new Headers(),
};

describe("createLocalUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUser.mockResolvedValue({ user: { id: "user-nuevo" } });
    mockAddMember.mockResolvedValue({});
  });

  it("crea la cuenta con correo sintetico y la mete en el espacio", async () => {
    encolarConsultas([{ role: "admin" }], []);

    const resultado = await createLocalUser(ENTRADA);

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    const cuerpo = mockCreateUser.mock.calls[0][0].body;
    expect(cuerpo.email).toBe("ana.torres@local.riuna");
    expect(cuerpo.data).toMatchObject({
      username: "ana.torres",
      isLocalAccount: true,
      emailVerified: true,
    });
    expect(mockAddMember).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          userId: "user-nuevo",
          organizationId: "ws-1",
        }),
      }),
    );
    expect(resultado.username).toBe("ana.torres");
  });

  it("rechaza a quien no es admin de instancia sin llegar a crear nada", async () => {
    encolarConsultas([{ role: "user" }]);

    await expect(createLocalUser(ENTRADA)).rejects.toMatchObject({
      status: 403,
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rechaza un nombre de usuario ya cogido con un 409, no con un fallo de la base", async () => {
    encolarConsultas([{ role: "admin" }], [{ id: "user-existente" }]);

    await expect(createLocalUser(ENTRADA)).rejects.toMatchObject({
      status: 409,
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rechaza un nombre con arroba, que es lo que separa usuario de correo al entrar", async () => {
    encolarConsultas([{ role: "admin" }]);

    await expect(
      createLocalUser({ ...ENTRADA, username: "ana@torres" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("normaliza el nombre de usuario a minusculas", async () => {
    encolarConsultas([{ role: "admin" }], []);

    await createLocalUser({ ...ENTRADA, username: "  Ana.Torres  " });

    expect(mockCreateUser.mock.calls[0][0].body.email).toBe(
      "ana.torres@local.riuna",
    );
  });
});

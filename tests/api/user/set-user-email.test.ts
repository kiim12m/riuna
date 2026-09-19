import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

import setUserEmail from "../../../apps/api/src/user/controllers/set-user-email";

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

let valoresGuardados: Record<string, unknown> | null = null;

function prepararUpdate() {
  valoresGuardados = null;
  mockUpdate.mockImplementation(() => {
    const chain = {
      set: (values: Record<string, unknown>) => {
        valoresGuardados = values;
        return chain;
      },
      where: () => chain,
      returning: () =>
        Promise.resolve([
          { id: "user-local", email: "ana@ejemplo.com", isLocalAccount: false },
        ]),
    };
    return chain;
  });
}

const ENTRADA = {
  actorId: "user-admin",
  userId: "user-local",
  email: "ana@ejemplo.com",
};

const ADMIN = [{ role: "admin" }];
const DESTINO = [{ id: "user-local", email: "ana@local.riuna" }];

describe("setUserEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepararUpdate();
  });

  it("asigna el correo y con eso la cuenta deja de ser local", async () => {
    encolarConsultas(ADMIN, DESTINO, []);

    const resultado = await setUserEmail(ENTRADA);

    expect(valoresGuardados).toEqual({
      email: "ana@ejemplo.com",
      emailVerified: true,
      isLocalAccount: false,
    });
    expect(resultado?.isLocalAccount).toBe(false);
  });

  it("rechaza a quien no es admin de instancia", async () => {
    encolarConsultas([{ role: "user" }]);

    await expect(setUserEmail(ENTRADA)).rejects.toMatchObject({ status: 403 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("no deja asignar a mano una direccion del dominio reservado", async () => {
    encolarConsultas(ADMIN);

    await expect(
      setUserEmail({ ...ENTRADA, email: "otra@local.riuna" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rechaza un correo que ya es de otra cuenta con un 409", async () => {
    encolarConsultas(ADMIN, DESTINO, [{ id: "otro-usuario" }]);

    await expect(setUserEmail(ENTRADA)).rejects.toMatchObject({ status: 409 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("acepta reasignar el mismo correo que ya tiene la propia cuenta", async () => {
    encolarConsultas(ADMIN, DESTINO, [{ id: "user-local" }]);

    await expect(setUserEmail(ENTRADA)).resolves.toBeTruthy();
  });

  it("rechaza una direccion mal formada", async () => {
    encolarConsultas(ADMIN);

    await expect(
      setUserEmail({ ...ENTRADA, email: "ana-sin-arroba" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

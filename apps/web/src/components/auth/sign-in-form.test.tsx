import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInEmail = vi.fn();
const signInUsername = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: (body: { email: string; password: string }) => signInEmail(body),
      username: (body: { username: string; password: string }) =>
        signInUsername(body),
    },
  },
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { SignInForm } from "./sign-in-form";

function rellenarYEnviar(identificador: string) {
  render(<SignInForm />);
  fireEvent.change(
    screen.getByPlaceholderText("auth:forms.identifierPlaceholder"),
    { target: { value: identificador } },
  );
  fireEvent.change(
    screen.getByPlaceholderText("auth:forms.passwordPlaceholder"),
    { target: { value: "contrasena-larga" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "auth:signInForm.signIn" }),
  );
}

describe("SignInForm", () => {
  beforeEach(() => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    signInUsername.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("entra por usuario cuando el identificador no lleva arroba", async () => {
    rellenarYEnviar("ana.torres");

    await waitFor(() => {
      expect(signInUsername).toHaveBeenCalledWith({
        username: "ana.torres",
        password: "contrasena-larga",
      });
    });
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("entra por correo cuando el identificador lleva arroba", async () => {
    rellenarYEnviar("ana@ejemplo.com");

    await waitFor(() => {
      expect(signInEmail).toHaveBeenCalledWith({
        email: "ana@ejemplo.com",
        password: "contrasena-larga",
      });
    });
    expect(signInUsername).not.toHaveBeenCalled();
  });

  it("no acepta un correo mal formado, que antes cazaba la validacion de email", async () => {
    rellenarYEnviar("ana@");

    await waitFor(() => {
      expect(signInEmail).not.toHaveBeenCalled();
    });
    expect(signInUsername).not.toHaveBeenCalled();
  });
});

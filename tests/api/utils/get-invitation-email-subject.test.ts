import { describe, expect, it } from "vitest";
import { getInvitationEmailSubject } from "../../../apps/api/src/utils/get-invitation-email-subject";

describe("getInvitationEmailSubject", () => {
  it("uses English copy for regional English locales", () => {
    const subject = getInvitationEmailSubject("en-GB", "Alice", "Producto");

    expect(subject).toBe("Alice invited you to join Producto on Riuna");
  });

  it("uses Spanish copy for regional Spanish locales", () => {
    const subject = getInvitationEmailSubject("es-MX", "Alice", "Producto");

    expect(subject).toBe("Alice te ha invitado a unirte a Producto en Riuna");
  });

  it("falls back to Spanish for unsupported locales", () => {
    const subject = getInvitationEmailSubject("de-DE", "Alice", "Producto");

    expect(subject).toBe("Alice te ha invitado a unirte a Producto en Riuna");
  });

  it("falls back to Spanish when no locale is given", () => {
    const subject = getInvitationEmailSubject(null, "Alice", "Producto");

    expect(subject).toBe("Alice te ha invitado a unirte a Producto en Riuna");
  });
});

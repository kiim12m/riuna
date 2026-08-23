import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import enUS from "../../../../i18n/en-US.json";
import esES from "../../../../i18n/es-ES.json";
import WorkspaceInvitationEmail from "./workspace-invitation";

describe("WorkspaceInvitationEmail", () => {
  it("renders the invitation in Spanish for a Spanish locale", async () => {
    const html = await render(
      createElement(WorkspaceInvitationEmail, {
        workspaceName: "Equipo Producto",
        inviterName: "Camille",
        inviterEmail: "camille@example.com",
        invitationLink: "https://riuna.example/invite/abc",
        to: "invite@example.com",
        copy: esES.invitations.email,
      }),
    );

    expect(html).toContain("Únete a Equipo Producto");
    expect(html).toContain("Aceptar invitación");
    expect(html).toContain("Camille (camille@example.com)");
  });
});

describe("WorkspaceInvitationEmail default copy", () => {
  it("renders without a copy prop so previews and exports work", async () => {
    const html = await render(
      createElement(WorkspaceInvitationEmail, {
        workspaceName: "Acme Inc",
        inviterName: "John Doe",
        inviterEmail: "john@acme.com",
        invitationLink: "https://kaneo.app/invite/abc123",
        to: "invitee@example.com",
      }),
    );

    expect(html).toContain("Join Acme Inc");
    expect(html).toContain("Accept invitation");
  });

  it("keeps the fallback in sync with the en-US bundle", async () => {
    const html = await render(
      createElement(WorkspaceInvitationEmail, {
        workspaceName: "Acme Inc",
        inviterName: "John Doe",
        inviterEmail: "john@acme.com",
        invitationLink: "https://kaneo.app/invite/abc123",
        to: "invitee@example.com",
      }),
    );
    const withEnUs = await render(
      createElement(WorkspaceInvitationEmail, {
        workspaceName: "Acme Inc",
        inviterName: "John Doe",
        inviterEmail: "john@acme.com",
        invitationLink: "https://kaneo.app/invite/abc123",
        to: "invitee@example.com",
        copy: enUS.invitations.email,
      }),
    );

    expect(html).toBe(withEnUs);
  });
});

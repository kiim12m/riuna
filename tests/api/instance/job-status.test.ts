import { describe, expect, it } from "vitest";
import { errorText } from "../../../apps/api/src/instance/job-status";

// Revision de la Fase 9, hallazgo 4: el ultimo error de un trabajo se ve en el
// estado de la instancia y va en el texto de la alerta. No puede llevar un
// secreto.
describe("errorText", () => {
  it("keeps only the origin of a URL whose token is in the path", () => {
    const text = errorText(
      new Error(
        "Telegram fallo: https://api.telegram.org/bot123456:AAH-secreto/sendMessage",
      ),
    );

    expect(text).toBe("Telegram fallo: https://api.telegram.org/…");
  });

  it("drops webhook paths and queries alike", () => {
    const text = errorText(
      new Error(
        "POST https://discord.com/api/webhooks/42/tokendediscord fallo; antes https://hooks.slack.com/services/T0/B0/xyz?token=abc",
      ),
    );

    expect(text).not.toMatch(/tokendediscord|xyz|abc|T0/);
    expect(text).toContain("https://discord.com/…");
    expect(text).toContain("https://hooks.slack.com/…");
  });

  it("drops the values Drizzle appends to a failed query", () => {
    const text = errorText(
      new Error(
        'Failed query: update "session" set "token" = $1 where "id" = $2\nparams: tok_secreto,ses_1',
      ),
    );

    expect(text).not.toContain("tok_secreto");
    expect(text).toContain("Failed query");
  });

  it("keeps a plain message and caps its length", () => {
    expect(errorText("sin conexion")).toBe("sin conexion");
    expect(errorText(new Error("x".repeat(900)))).toHaveLength(500);
  });
});

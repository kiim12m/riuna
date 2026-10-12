import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveClientIp } from "../../../apps/api/src/utils/client-ip";
import { hit } from "../../../apps/api/src/utils/rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveClientIp (ADR 074)", () => {
  it("ignores X-Forwarded-For when the connection does not come from a trusted proxy", () => {
    expect(resolveClientIp("1.2.3.4", "198.51.100.7")).toBe("198.51.100.7");
  });

  it("takes the hop the trusted proxy added, not the one the caller wrote", () => {
    // tailscale serve -> pasarela de Docker: el cliente es la IP de Tailscale.
    expect(resolveClientIp("6.6.6.6, 100.101.102.103", "172.17.0.1")).toBe(
      "100.101.102.103",
    );
  });

  it("walks past every trusted proxy in the chain", () => {
    expect(
      resolveClientIp("100.64.0.9, 10.0.0.5, 127.0.0.1", "::ffff:172.18.0.1"),
    ).toBe("100.64.0.9");
  });

  it("falls back to the peer when everything is local", () => {
    expect(resolveClientIp(undefined, "127.0.0.1")).toBe("127.0.0.1");
  });

  it("gives up on a malformed hop instead of guessing", () => {
    expect(resolveClientIp("no-es-una-ip", "127.0.0.1")).toBeNull();
  });

  it("knows nothing without a socket", () => {
    expect(resolveClientIp("1.2.3.4", null)).toBeNull();
  });

  it("honours TRUSTED_PROXIES", () => {
    vi.stubEnv("TRUSTED_PROXIES", "203.0.113.10");

    expect(resolveClientIp("100.64.0.1", "203.0.113.10")).toBe("100.64.0.1");
    // La pasarela de Docker deja de ser de confianza.
    expect(resolveClientIp("100.64.0.1", "172.17.0.1")).toBe("172.17.0.1");
  });
});

describe("hit", () => {
  it("lets max requests through per window and then says how long to wait", () => {
    const key = `prueba-${Math.random()}`;
    const start = 1_000_000;

    expect(hit(key, 2, 60_000, start)).toBeNull();
    expect(hit(key, 2, 60_000, start + 1)).toBeNull();
    expect(hit(key, 2, 60_000, start + 20_000)).toBe(40);
    // Abierta la ventana siguiente, vuelve a caber.
    expect(hit(key, 2, 60_000, start + 60_000)).toBeNull();
  });
});

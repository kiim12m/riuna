import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../../../apps/api/src/utils/log";
import { installOutboundGuard } from "../../../apps/api/src/utils/outbound-guard";

// Revision de la Fase 9, hallazgo 3: el simulacro restaura en claro los
// webhooks de las integraciones de proyecto. Con
// RIUNA_DISABLE_OUTBOUND, la API no puede alcanzarlos.

const realFetch = globalThis.fetch;

function stubNetwork() {
  const network = vi.fn(async () => new Response("ok"));
  globalThis.fetch = network as unknown as typeof fetch;
  return network;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("installOutboundGuard", () => {
  it("refuses anything that leaves the machine", async () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    vi.spyOn(log, "info").mockImplementation(() => {});
    vi.stubEnv("RIUNA_DISABLE_OUTBOUND", "true");
    const network = stubNetwork();

    installOutboundGuard();

    await expect(
      fetch("https://hooks.slack.com/services/T0/B0/secreto", {
        method: "POST",
      }),
    ).rejects.toThrow("RIUNA_DISABLE_OUTBOUND");
    await expect(
      fetch(new Request("https://api.telegram.org/bot1:token/sendMessage")),
    ).rejects.toThrow("https://api.telegram.org");
    await expect(fetch("http://10.0.0.7:3000/api/v1/repos")).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });

  it("still lets the instance talk to itself", async () => {
    vi.spyOn(log, "info").mockImplementation(() => {});
    vi.stubEnv("RIUNA_DISABLE_OUTBOUND", "true");
    const network = stubNetwork();

    installOutboundGuard();

    await fetch("http://127.0.0.1:1337/api/health");
    await fetch("http://localhost:5173/");
    await fetch("http://[::1]:1337/");
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("changes nothing without the variable", async () => {
    const network = stubNetwork();

    installOutboundGuard();

    await fetch("https://hooks.slack.com/services/T0/B0/x");
    expect(network).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ipBucket,
  resolveClientIp,
} from "../../../apps/api/src/utils/client-ip";
import { log } from "../../../apps/api/src/utils/log";
import { hit } from "../../../apps/api/src/utils/rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

// Revision de la Fase 9, hallazgos 5 y 15.
describe("TRUSTED_PROXIES validation", () => {
  it("ignores an entry whose prefix is out of range instead of throwing on every request", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    vi.stubEnv("TRUSTED_PROXIES", "10.0.0.0/33, 203.0.113.10");

    expect(resolveClientIp("100.64.0.1", "203.0.113.10")).toBe("100.64.0.1");
    expect(resolveClientIp("100.64.0.1", "10.0.0.1")).toBe("10.0.0.1");
    expect(warn).toHaveBeenCalledWith(
      "Ignoring an invalid TRUSTED_PROXIES entry",
      {
        entry: "10.0.0.0/33",
      },
    );
  });

  it("does not read an empty prefix as /0, which would trust every address", () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    vi.stubEnv("TRUSTED_PROXIES", "10.0.0.0/");

    // Con todo de confianza se leeria la cadena, y el salto malformado dejaria
    // la peticion sin IP.
    expect(resolveClientIp("no-es-una-ip", "198.51.100.7")).toBe(
      "198.51.100.7",
    );
  });

  it("ignores something that is not an address", () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    vi.stubEnv("TRUSTED_PROXIES", "abc, ::1/129, 10.0.0.0/8/8");

    expect(resolveClientIp("6.6.6.6", "10.1.2.3")).toBe("10.1.2.3");
  });

  it("accepts /0 when it is written on purpose", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    vi.stubEnv("TRUSTED_PROXIES", "0.0.0.0/0");

    // El socket es de confianza: se lee la cadena, y un salto malformado ya no
    // deja pasar al socket como cliente.
    expect(resolveClientIp("no-es-una-ip", "198.51.100.7")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("builds the list once per value, not on every request", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    vi.stubEnv("TRUSTED_PROXIES", "abc,10.9.9.9");

    for (let i = 0; i < 5; i += 1) resolveClientIp(undefined, "10.9.9.9");

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

// Revision de la Fase 9, hallazgo 8.
describe("ipBucket", () => {
  it("puts every address of one IPv6 /64 in the same bucket", () => {
    const key = `prueba-${Math.random()}`;
    const first = ipBucket("2001:db8:abcd:12::1");
    const second = ipBucket("2001:0db8:abcd:0012:ffff:1:2:3");

    expect(first).toBe("2001:db8:abcd:12::/64");
    expect(second).toBe(first);
    expect(hit(`${key}:${first}`, 1, 60_000, 0)).toBeNull();
    expect(hit(`${key}:${second}`, 1, 60_000, 1)).not.toBeNull();
  });

  it("keeps different /64 apart", () => {
    expect(ipBucket("2001:db8:abcd:13::1")).not.toBe(
      ipBucket("2001:db8:abcd:12::1"),
    );
  });

  it("expands :: wherever it is", () => {
    expect(ipBucket("::1")).toBe("0:0:0:0::/64");
    expect(ipBucket("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(ipBucket("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("64:ff9b:1::1.2.3.4")).toBe("64:ff9b:1:0::/64");
  });

  it("leaves IPv4 alone", () => {
    expect(ipBucket("198.51.100.7")).toBe("198.51.100.7");
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

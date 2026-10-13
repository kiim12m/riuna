export type DeviceKind = "phone" | "desktop";

export type DeviceDescription = {
  browser: string | null;
  os: string | null;
  kind: DeviceKind;
};

// El orden importa: Edge y Opera dicen tambien «Chrome», y Chrome dice
// tambien «Safari».
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/**
 * «Chrome en Windows» a partir del `User-Agent` que guardó la sesión (ADR
 * 079). Lo justo para reconocer un dispositivo propio, sin dependencia: no
 * pretende distinguir versiones ni modelos.
 */
export function describeUserAgent(
  userAgent: string | null | undefined,
): DeviceDescription {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const kind: DeviceKind = /Mobi|iPhone|iPod|Android.*Mobile/.test(ua)
    ? "phone"
    : "desktop";
  return { browser, os, kind };
}

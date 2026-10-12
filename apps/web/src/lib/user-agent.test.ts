import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/129.0.0.0`;
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX_UBUNTU =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("describeUserAgent", () => {
  it("names the browser and the system", () => {
    expect(describeUserAgent(CHROME_WINDOWS)).toEqual({
      browser: "Chrome",
      os: "Windows",
      kind: "desktop",
    });
    expect(describeUserAgent(FIREFOX_UBUNTU)).toMatchObject({
      browser: "Firefox",
      os: "Linux",
    });
    expect(describeUserAgent(SAFARI_MAC)).toMatchObject({
      browser: "Safari",
      os: "macOS",
    });
  });

  it("does not mistake Edge for Chrome", () => {
    expect(describeUserAgent(EDGE_WINDOWS).browser).toBe("Edge");
  });

  it("tells phones apart, iOS before macOS", () => {
    expect(describeUserAgent(SAFARI_IPHONE)).toEqual({
      browser: "Safari",
      os: "iOS",
      kind: "phone",
    });
    expect(describeUserAgent(CHROME_ANDROID)).toEqual({
      browser: "Chrome",
      os: "Android",
      kind: "phone",
    });
  });

  it("survives an empty or unknown agent", () => {
    expect(describeUserAgent(null)).toEqual({
      browser: null,
      os: null,
      kind: "desktop",
    });
    expect(describeUserAgent("curl/8.5.0")).toMatchObject({
      browser: null,
      os: null,
    });
  });
});

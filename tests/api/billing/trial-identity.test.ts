import { describe, expect, it } from "vitest";
import {
  hashTrialEmail,
  normalizeTrialEmail,
} from "../../../apps/api/src/billing/trial-identity";

describe("normalizeTrialEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeTrialEmail("  Andrej@Riuna.APP ")).toBe("andrej@riuna.app");
  });

  it("drops plus tags so aliases share one trial", () => {
    expect(normalizeTrialEmail("andrej+trial2@riuna.app")).toBe(
      "andrej@riuna.app",
    );
  });

  it("keeps the address when stripping would empty the local part", () => {
    expect(normalizeTrialEmail("+tag@riuna.app")).toBe("+tag@riuna.app");
  });

  it("leaves values without an address shape alone", () => {
    expect(normalizeTrialEmail("not-an-email")).toBe("not-an-email");
  });
});

describe("hashTrialEmail", () => {
  it("matches for addresses that normalize to the same mailbox", () => {
    expect(hashTrialEmail("Andrej+one@riuna.app")).toBe(
      hashTrialEmail("andrej@riuna.app"),
    );
  });

  it("differs for different mailboxes", () => {
    expect(hashTrialEmail("a@riuna.app")).not.toBe(
      hashTrialEmail("b@riuna.app"),
    );
  });

  it("does not store the address itself", () => {
    expect(hashTrialEmail("andrej@riuna.app")).not.toContain("riuna");
  });
});

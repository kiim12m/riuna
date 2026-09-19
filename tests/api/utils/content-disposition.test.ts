import { describe, expect, it } from "vitest";
import { buildContentDisposition } from "../../../apps/api/src/utils/content-disposition";

describe("buildContentDisposition", () => {
  it("keeps a trailing backslash from escaping the closing quote", () => {
    const header = buildContentDisposition("informe\\", false);

    expect(header).toBe(
      "attachment; filename=\"informe-\"; filename*=UTF-8''informe%5C",
    );
  });

  it("replaces both kinds of slash in the ASCII fallback", () => {
    const header = buildContentDisposition("a/b\\c.pdf", true);

    expect(header.startsWith('inline; filename="a-b-c.pdf";')).toBe(true);
  });
});

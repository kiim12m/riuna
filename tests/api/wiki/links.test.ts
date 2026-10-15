import { describe, expect, it } from "vitest";
import { linkedPageIds, linkedTaskIds } from "../../../apps/api/src/wiki/links";

describe("wiki links", () => {
  it("reads task ids from the chip, by attribute or by URL", () => {
    const markdown = [
      '<riuna-issue-link url="https://riuna/x/task/abc123" issue-key="ALC-6" task-id="abc123" />',
      '<riuna-issue-link url="https://riuna/dashboard/workspace/w/project/p/task/def456" issue-key="" task-id="" />',
      '<kaneo-issue-link url="https://old/task/ghi789" />',
      '<riuna-issue-link url="https://riuna/x/task/abc123" task-id="abc123" />',
    ].join("\n");
    expect(linkedTaskIds(markdown)).toEqual(["abc123", "def456", "ghi789"]);
  });

  it("reads plain task URLs too, which the API and MCP do not turn into chips", () => {
    expect(
      linkedTaskIds(
        [
          "Ver https://riuna.local/dashboard/workspace/w1/project/p1/task/abc123 y",
          "[la otra](/dashboard/workspace/w1/project/p2/task/def456).",
          "No: https://github.com/org/repo/task/zzz999.",
        ].join("\n"),
      ),
    ).toEqual(["abc123", "def456"]);
  });

  it("reads page ids from page chips and ignores everything else", () => {
    expect(
      linkedPageIds(
        'Ver <riuna-page-link page-id="p1" title="Actas" /> y <riuna-page-link page-id="p2" title="Corte" url="/wiki?page=p2"></riuna-page-link>, no [esto](https://x/wiki?page=p3).',
      ),
    ).toEqual(["p1", "p2"]);
    expect(linkedPageIds(null)).toEqual([]);
    expect(linkedTaskIds("")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { buildWikiTree, descendantIds, pathTo } from "./wiki-tree";

const page = (id: string, parentId: string | null, position = 0) => ({
  id,
  title: id,
  parentId,
  projectId: null,
  position,
});

describe("wiki tree", () => {
  const pages = [
    page("obras", null, 1),
    page("alcala", "obras", 1),
    page("actas", "alcala", 1),
    page("manual", null, 2),
    page("huerfana", "borrada", 3),
  ];

  it("nests by parent and keeps orphans at the root", () => {
    const tree = buildWikiTree(pages);
    expect(tree.map((node) => node.id)).toEqual([
      "obras",
      "manual",
      "huerfana",
    ]);
    expect(tree[0]?.children[0]?.children[0]).toMatchObject({
      id: "actas",
      depth: 2,
    });
  });

  it("finds a branch and the path to a page", () => {
    expect([...descendantIds(pages, "obras")].sort()).toEqual([
      "actas",
      "alcala",
    ]);
    expect(pathTo(pages, "actas").map((node) => node.id)).toEqual([
      "obras",
      "alcala",
      "actas",
    ]);
  });
});

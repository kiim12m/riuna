import { describe, expect, it } from "vitest";
import {
  ancestorIds,
  childPath,
  childTaskTreeFields,
  depthFromPath,
  descendantsPattern,
  isInSubtree,
  rebasePath,
  rejectReparent,
  rootPath,
  rootTaskTreeFields,
  subtreePattern,
} from "../../../apps/api/src/task/tree";

// Un arbol de juguete, con una rama larga y otra corta, para que las pruebas
// de los limites no dependan de que todas las ramas midan lo mismo:
//
//   a
//   ├── b
//   │   └── c
//   └── d
const a = { id: "a", path: "/a/", depth: 0, projectId: "p" };
const b = { id: "b", path: "/a/b/", depth: 1, projectId: "p" };
const c = { id: "c", path: "/a/b/c/", depth: 2, projectId: "p" };
const d = { id: "d", path: "/a/d/", depth: 1, projectId: "p" };

describe("task tree paths", () => {
  it("gives a root task a path made of itself", () => {
    expect(rootPath("x")).toBe("/x/");
    expect(depthFromPath(rootPath("x"))).toBe(0);
  });

  it("keeps depth and path in step for a child", () => {
    const path = childPath(b.path, "z");
    expect(path).toBe("/a/b/z/");
    expect(depthFromPath(path)).toBe(2);
  });

  it("derives fields whose path always ends in the new id", () => {
    const root = rootTaskTreeFields();
    expect(root.path).toBe(`/${root.id}/`);
    expect(root.depth).toBe(0);
    expect(root.parentId).toBeNull();

    const child = childTaskTreeFields(b);
    expect(child.path).toBe(`/a/b/${child.id}/`);
    expect(child.depth).toBe(2);
    expect(child.parentId).toBe("b");
  });

  it("matches the subtree by prefix, and the descendants without the root", () => {
    expect(subtreePattern(b.path)).toBe("/a/b/%");
    expect(descendantsPattern(b.path)).toBe("/a/b/_%");
  });

  it("reads containment straight off the path", () => {
    expect(isInSubtree(c.path, a.path)).toBe(true);
    expect(isInSubtree(c.path, b.path)).toBe(true);
    expect(isInSubtree(d.path, b.path)).toBe(false);
    // Una tarea esta dentro de su propio subarbol: es la raiz de el.
    expect(isInSubtree(b.path, b.path)).toBe(true);
  });

  it("lists the ancestors without the task itself", () => {
    expect(ancestorIds(c.path)).toEqual(["a", "b"]);
    expect(ancestorIds(a.path)).toEqual([]);
  });

  it("rebases a descendant when its branch moves", () => {
    expect(rebasePath(c.path, b.path, "/d/b/")).toBe("/d/b/c/");
    expect(() => rebasePath(d.path, b.path, "/x/")).toThrow();
  });
});

describe("reparent validation", () => {
  const maxDepth = 5;

  it("accepts an ordinary move", () => {
    expect(
      rejectReparent({ task: d, parent: b, subtreeHeight: 0, maxDepth }),
    ).toBeNull();
  });

  it("refuses a task as its own parent", () => {
    expect(
      rejectReparent({ task: b, parent: b, subtreeHeight: 1, maxDepth }),
    ).toBe("self");
  });

  it("refuses moving a task under its own descendant", () => {
    expect(
      rejectReparent({ task: a, parent: c, subtreeHeight: 2, maxDepth }),
    ).toBe("cycle");
    expect(
      rejectReparent({ task: b, parent: c, subtreeHeight: 1, maxDepth }),
    ).toBe("cycle");
  });

  it("refuses a parent from another project", () => {
    expect(
      rejectReparent({
        task: b,
        parent: { ...a, projectId: "other" },
        subtreeHeight: 1,
        maxDepth,
      }),
    ).toBe("cross-project");
  });

  it("counts the height of the moved branch, not just the parent", () => {
    const deepParent = {
      id: "p4",
      path: "/1/2/3/4/",
      depth: 3,
      projectId: "p",
    };

    // Una hoja cabe justo en el quinto nivel.
    expect(
      rejectReparent({
        task: d,
        parent: deepParent,
        subtreeHeight: 0,
        maxDepth,
      }),
    ).toBeNull();

    // La misma tarea con una hija debajo ya no: la nieta caeria en el sexto.
    expect(
      rejectReparent({
        task: d,
        parent: deepParent,
        subtreeHeight: 1,
        maxDepth,
      }),
    ).toBe("too-deep");
  });

  it("checks the limit even when promoting to root", () => {
    expect(
      rejectReparent({ task: c, parent: null, subtreeHeight: 4, maxDepth }),
    ).toBeNull();
    expect(
      rejectReparent({ task: c, parent: null, subtreeHeight: 5, maxDepth }),
    ).toBe("too-deep");
  });
});

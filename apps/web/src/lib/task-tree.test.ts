import { describe, expect, it } from "vitest";
import type Task from "@/types/task";
import {
  buildTaskTree,
  flattenVisibleRows,
  indentTarget,
  outdentTarget,
  wouldCreateCycle,
} from "./task-tree";

/**
 * 155 lineas de logica de arbol pura sin una sola prueba hasta la Fase 4.5, y
 * es quien dibuja la jerarquia que la Fase 2 construyo. Su equivalente en el
 * servidor (`apps/api/src/task/tree.ts`) si estaba cubierto.
 */

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    parentId: null,
    position: 0,
    number: 0,
    ...overrides,
  } as Task;
}

function byId(tasks: Task[]) {
  return new Map(tasks.map((entry) => [entry.id, entry]));
}

function rowsOf(tasks: Task[], collapsed: string[] = []) {
  return flattenVisibleRows(buildTaskTree(tasks), new Set(collapsed));
}

describe("buildTaskTree", () => {
  it("builds a flat forest when nothing has a parent", () => {
    const roots = buildTaskTree([task("a"), task("b")]);

    expect(roots.map((node) => node.task.id)).toEqual(["a", "b"]);
    expect(roots.every((node) => node.depth === 0)).toBe(true);
  });

  it("nests children and gives them the depth of the view", () => {
    const roots = buildTaskTree([
      task("padre"),
      task("hija", { parentId: "padre" }),
      task("nieta", { parentId: "hija" }),
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0].children[0].task.id).toBe("hija");
    expect(roots[0].children[0].depth).toBe(1);
    expect(roots[0].children[0].children[0].depth).toBe(2);
  });

  it("promotes an orphan whose parent is filtered out", () => {
    // Su padre existe en la base pero no en esta lista: archivado, filtrado o
    // en otra seccion. Dibujarla como raiz es mejor que perderla.
    const roots = buildTaskTree([task("huerfana", { parentId: "ausente" })]);

    expect(roots.map((node) => node.task.id)).toEqual(["huerfana"]);
  });

  it("orders siblings by position, breaking ties by number", () => {
    const roots = buildTaskTree([
      task("tercera", { position: 2, number: 9 }),
      task("primera", { position: 1, number: 5 }),
      task("segunda", { position: 1, number: 7 }),
    ]);

    expect(roots.map((node) => node.task.id)).toEqual([
      "primera",
      "segunda",
      "tercera",
    ]);
  });

  // El fallo silencioso que motivo estas pruebas: con `A` colgando de `B` y
  // `B` de `A`, los dos encuentran padre, ninguno entra en `roots`, y la rama
  // entera desaparecia de la vista Lista sin error ni hueco.
  it("does not swallow a cycle: every task still shows up", () => {
    const roots = buildTaskTree([
      task("a", { parentId: "b" }),
      task("b", { parentId: "a" }),
      task("suelta"),
    ]);

    const rows = flattenVisibleRows(roots, new Set());
    expect(rows.map((row) => row.task.id).sort()).toEqual(["a", "b", "suelta"]);
  });

  it("does not swallow what hangs below a cycle either", () => {
    const rows = rowsOf([
      task("a", { parentId: "b" }),
      task("b", { parentId: "a" }),
      task("hija", { parentId: "a" }),
    ]);

    expect(rows.map((row) => row.task.id).sort()).toEqual(["a", "b", "hija"]);
  });
});

describe("flattenVisibleRows", () => {
  it("walks in drawing order and marks who has children", () => {
    const rows = rowsOf([
      task("padre"),
      task("hija", { parentId: "padre" }),
      task("otra"),
    ]);

    expect(rows.map((row) => row.task.id)).toEqual(["padre", "hija", "otra"]);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[1].hasChildren).toBe(false);
  });

  it("hides what hangs from a collapsed branch", () => {
    const rows = rowsOf(
      [
        task("padre"),
        task("hija", { parentId: "padre" }),
        task("nieta", { parentId: "hija" }),
      ],
      ["padre"],
    );

    expect(rows.map((row) => row.task.id)).toEqual(["padre"]);
    expect(rows[0].isCollapsed).toBe(true);
  });

  it("does not mark a childless task as collapsed", () => {
    const rows = rowsOf([task("sola")], ["sola"]);

    expect(rows[0].isCollapsed).toBe(false);
  });
});

describe("indentTarget", () => {
  it("hangs the task from the sibling right above it", () => {
    const rows = rowsOf([
      task("primera", { position: 1 }),
      task("segunda", { position: 2 }),
    ]);

    expect(indentTarget(rows, "segunda")).toBe("primera");
  });

  it("refuses the first row, which has no sibling above", () => {
    const rows = rowsOf([task("primera"), task("segunda")]);

    expect(indentTarget(rows, "primera")).toBeNull();
  });

  it("refuses the first child of a branch", () => {
    // Encima solo tiene a su propio padre, que esta menos sangrado.
    const rows = rowsOf([task("padre"), task("hija", { parentId: "padre" })]);

    expect(indentTarget(rows, "hija")).toBeNull();
  });

  it("skips over a deeper branch to find the real previous sibling", () => {
    const rows = rowsOf([
      task("primera", { position: 1 }),
      task("nieta", { parentId: "primera" }),
      task("segunda", { position: 2 }),
    ]);

    expect(indentTarget(rows, "segunda")).toBe("primera");
  });
});

describe("outdentTarget", () => {
  // La diferencia entre `undefined` y `null` no es cosmetica: `undefined` es
  // "no hay nada que hacer" y `null` es "pasa a ser raiz", que si es un cambio
  // que hay que mandar al servidor.
  it("returns undefined for a task that is already a root", () => {
    const tasks = byId([task("raiz")]);

    expect(outdentTarget(tasks, "raiz")).toBeUndefined();
  });

  it("returns null when the new home is the project root", () => {
    const tasks = byId([task("padre"), task("hija", { parentId: "padre" })]);

    expect(outdentTarget(tasks, "hija")).toBeNull();
  });

  it("returns the grandparent when there is one", () => {
    const tasks = byId([
      task("abuela"),
      task("padre", { parentId: "abuela" }),
      task("nieta", { parentId: "padre" }),
    ]);

    expect(outdentTarget(tasks, "nieta")).toBe("abuela");
  });
});

describe("wouldCreateCycle", () => {
  it("refuses making a task its own parent", () => {
    const tasks = byId([task("a")]);

    expect(wouldCreateCycle(tasks, "a", "a")).toBe(true);
  });

  it("refuses hanging a task from its own descendant", () => {
    const tasks = byId([
      task("padre"),
      task("hija", { parentId: "padre" }),
      task("nieta", { parentId: "hija" }),
    ]);

    expect(wouldCreateCycle(tasks, "padre", "nieta")).toBe(true);
  });

  it("allows an unrelated branch", () => {
    const tasks = byId([
      task("padre"),
      task("hija", { parentId: "padre" }),
      task("ajena"),
    ]);

    expect(wouldCreateCycle(tasks, "hija", "ajena")).toBe(false);
  });

  it("terminates on data that is already cyclic", () => {
    const tasks = byId([
      task("a", { parentId: "b" }),
      task("b", { parentId: "a" }),
      task("c"),
    ]);

    expect(() => wouldCreateCycle(tasks, "c", "a")).not.toThrow();
  });
});

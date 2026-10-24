import { describe, expect, it } from "vitest";
import { dropNeighbours } from "./drop-neighbours";

const column = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("dropNeighbours", () => {
  it("puts a task moving down after the one it is dropped on", () => {
    expect(dropNeighbours(column, "a", "b")).toEqual({
      afterId: "b",
      beforeId: "c",
    });
  });

  it("puts a task moving up before the one it is dropped on", () => {
    expect(dropNeighbours(column, "c", "a")).toEqual({
      afterId: null,
      beforeId: "a",
    });
  });

  it("puts a task from another list after the one it is dropped on", () => {
    expect(dropNeighbours(column, "x", "a")).toEqual({
      afterId: "a",
      beforeId: "b",
    });
  });

  it("puts a task dropped on the list itself at the end", () => {
    expect(dropNeighbours(column, "x", "column")).toEqual({
      afterId: "c",
      beforeId: null,
    });
    expect(dropNeighbours(column, "a", "column")).toEqual({
      afterId: "c",
      beforeId: null,
    });
    expect(dropNeighbours([], "x", "column")).toEqual({
      afterId: null,
      beforeId: null,
    });
  });

  it("does not move a task dropped on itself", () => {
    expect(dropNeighbours(column, "b", "b")).toBeNull();
  });
});

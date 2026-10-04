import { describe, expect, it } from "vitest";
import {
  availableColumns,
  defaultColumnIds,
  resolveVisibleColumns,
  toggleColumn,
} from "./columns";

const t = ((key: string, options?: { name?: string }) =>
  options?.name ? `${key}:${options.name}` : key) as never;

const definitions = [
  { key: "presupuesto", name: "Presupuesto", type: "currency", config: {} },
  { key: "cliente", name: "Cliente", type: "text", config: {} },
] as never;

const options = availableColumns(definitions, t);

describe("table columns", () => {
  it("offers aggregates for the branch, and sums only for numeric fields", () => {
    const ids = options.map((option) => option.id);

    expect(ids).toContain("agg.progress");
    expect(ids).toContain("agg.estimate");
    expect(ids).toContain("agg.sum.presupuesto");
    expect(ids).not.toContain("agg.sum.cliente");
  });

  it("shows the usual columns and no aggregate when nothing was chosen", () => {
    const visible = resolveVisibleColumns(undefined, options);

    expect(visible.has("custom.presupuesto")).toBe(true);
    expect(visible.has("agg.progress")).toBe(false);
  });

  it("never hides the title, and ignores a column that no longer exists", () => {
    const visible = resolveVisibleColumns(
      ["status", "custom.archivado", "agg.progress"],
      options,
    );

    expect([...visible].sort()).toEqual(["agg.progress", "status", "title"]);
  });

  it("answers undefined when the result is the usual one, so the URL stays clean", () => {
    const withProgress = toggleColumn(undefined, options, "agg.progress");
    expect(withProgress).toContain("agg.progress");

    expect(toggleColumn(withProgress, options, "agg.progress")).toBeUndefined();
  });

  it("keeps the order the columns are offered in, not the order of the clicks", () => {
    const first = toggleColumn(undefined, options, "agg.estimate");
    const second = toggleColumn(first, options, "agg.progress");

    const aggregates = (second ?? []).filter((id) => id.startsWith("agg."));
    expect(aggregates).toEqual(["agg.progress", "agg.estimate"]);
  });

  it("does not let the title be toggled off", () => {
    expect(toggleColumn(undefined, options, "title")).toBeUndefined();
    expect(defaultColumnIds(options)).toContain("title");
  });
});

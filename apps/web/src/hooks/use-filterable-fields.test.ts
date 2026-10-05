import { describe, expect, it } from "vitest";
import { customFieldsToFilterable } from "./use-filterable-fields";

const t = ((key: string) => key) as never;

const field = (type: string, extra: Record<string, unknown> = {}) => ({
  key: `campo_${type}`,
  name: `Campo ${type}`,
  type,
  config: {},
  ...extra,
});

describe("customFieldsToFilterable", () => {
  it("maps each type to how it is compared", () => {
    const fields = customFieldsToFilterable(
      [
        field("number"),
        field("currency"),
        field("date"),
        field("text"),
      ] as never,
      t,
    );

    expect(fields.map((entry) => [entry.key, entry.valueType])).toEqual([
      ["custom.campo_number", "number"],
      ["custom.campo_currency", "number"],
      ["custom.campo_date", "date"],
      ["custom.campo_text", "text"],
    ]);
  });

  it("leaves a relation out: its value does not live in the JSONB", () => {
    expect(customFieldsToFilterable([field("relation")] as never, t)).toEqual(
      [],
    );
  });

  it("gives a checkbox the yes/no options it does not declare", () => {
    const [checkbox] = customFieldsToFilterable(
      [field("checkbox")] as never,
      t,
    );

    expect(checkbox?.valueType).toBe("boolean");
    expect(checkbox?.options?.map((option) => option.value)).toEqual([
      "true",
      "false",
    ]);
  });

  it("keeps the options of a select", () => {
    const options = [{ value: "obra", label: "Obra" }];
    const [select] = customFieldsToFilterable(
      [field("select", { config: { options } })] as never,
      t,
    );

    expect(select?.options).toEqual(options);
  });
});

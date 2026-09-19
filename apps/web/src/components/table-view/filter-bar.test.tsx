import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditableCondition, FilterableField } from "@/types/task-filter";
import FilterBar from "./filter-bar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "es-ES" },
  }),
}));

afterEach(() => {
  cleanup();
});

const fields: FilterableField[] = [
  { key: "custom.presupuesto", label: "Presupuesto", valueType: "number" },
];

const condition: EditableCondition = {
  id: "c1",
  field: "custom.presupuesto",
  operator: "gt",
  value: "",
} as EditableCondition;

function typeInto(text: string) {
  const onChange = vi.fn();
  render(
    <FilterBar fields={fields} conditions={[condition]} onChange={onChange} />,
  );
  const input = screen.getByPlaceholderText("tasks:table.filterValue");
  fireEvent.change(input, { target: { value: text } });
  return { input, onChange };
}

describe("FilterBar number value", () => {
  // Convertir en cada pulsacion devolvia "1" al teclear "1,": no habia forma
  // de escribir un decimal.
  it("keeps a half-typed decimal on screen", () => {
    const { input } = typeInto("1,");
    expect(input).toHaveValue("1,");
  });

  it("sends the number once it reads as one", () => {
    const { onChange } = typeInto("1.500,5");
    expect(onChange).toHaveBeenLastCalledWith([
      { ...condition, value: 1500.5 },
    ]);
  });

  // Y "-" mostraba "NaN".
  it("lets a negative number be started without sending NaN", () => {
    const { input, onChange } = typeInto("-");
    expect(input).toHaveValue("-");
    expect(onChange).not.toHaveBeenCalled();
  });
});

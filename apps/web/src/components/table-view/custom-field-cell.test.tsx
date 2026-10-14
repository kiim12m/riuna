import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CustomFieldCell, {
  type FieldDefinition,
  formatForDisplay,
} from "./custom-field-cell";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "es-ES" },
  }),
}));

afterEach(() => {
  cleanup();
});

const budget: FieldDefinition = {
  id: "field-1",
  key: "presupuesto",
  name: "Presupuesto",
  type: "number",
  required: false,
  config: {},
};

function editWith(text: string, onCommit = vi.fn()) {
  render(
    <CustomFieldCell definition={budget} value={1200} onCommit={onCommit} />,
  );
  fireEvent.click(screen.getByRole("button"));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: text } });
  return { input, onCommit };
}

describe("CustomFieldCell with a number", () => {
  it("reads the number the way it is written in Spanish", () => {
    const { input, onCommit } = editWith("1.500,50");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledWith(1500.5);
  });

  // Mandar null borraba el numero que ya habia.
  it("never erases the stored value with text that is not a number", () => {
    const { input, onCommit } = editWith("mucho");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("drops an unreadable edit when the cell loses focus", () => {
    const { input, onCommit } = editWith("mucho");
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("CustomFieldCell with a calculated field", () => {
  const formula = (config: Record<string, unknown>): FieldDefinition => ({
    id: "field-2",
    key: "margen",
    name: "Margen",
    type: "formula",
    required: false,
    config: { expression: "{a} / {b}", ...config },
  });

  it("shows the value and offers nothing to edit", () => {
    render(
      <CustomFieldCell
        definition={formula({ format: "number" })}
        value={287.5}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("formula-value").textContent).toMatch(/287/);
  });

  it("formats a percentage and a currency", () => {
    expect(formatForDisplay(formula({ format: "percent" }), 0.22)).toMatch(
      /22\s?%/,
    );
    expect(
      formatForDisplay(formula({ format: "currency", currency: "EUR" }), 12.5),
    ).toMatch(/12[.,]50/);
  });

  it("shows a dash when the result is empty", () => {
    render(
      <CustomFieldCell
        definition={formula({})}
        value={undefined}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByTestId("formula-value").textContent).toBe("—");
  });
});

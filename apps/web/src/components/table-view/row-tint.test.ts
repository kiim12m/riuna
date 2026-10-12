import { describe, expect, it } from "vitest";
import { rowTint } from "./row-tint";

// Lunes 12 de octubre de 2026 a media mañana.
const now = new Date(2026, 9, 12, 11, 0);
// Un vencimiento es la medianoche de su dia (ADR 049).
const day = (date: number) => new Date(2026, 9, date).toISOString();

const task = (overrides: Record<string, unknown> = {}) => ({
  priority: "medium",
  dueDate: null,
  completedAt: null,
  ...overrides,
});

describe("rowTint", () => {
  it("colours nothing without a colouring", () => {
    expect(rowTint(task({ priority: "urgent" }), undefined, now)).toBeNull();
  });

  it("paints urgent and high priority", () => {
    expect(rowTint(task({ priority: "urgent" }), "priority", now)).toBe(
      "danger",
    );
    expect(rowTint(task({ priority: "high" }), "priority", now)).toBe(
      "warning",
    );
    expect(rowTint(task({ priority: "low" }), "priority", now)).toBeNull();
  });

  it("paints overdue and what is due this week", () => {
    expect(rowTint(task({ dueDate: day(9) }), "due", now)).toBe("danger");
    // Vence hoy: todavia no ha vencido.
    expect(rowTint(task({ dueDate: day(12) }), "due", now)).toBe("warning");
    expect(rowTint(task({ dueDate: day(18) }), "due", now)).toBe("warning");
    expect(rowTint(task({ dueDate: day(19) }), "due", now)).toBeNull();
  });

  it("leaves done and undated tasks alone", () => {
    expect(
      rowTint(task({ dueDate: day(1), completedAt: day(2) }), "due", now),
    ).toBeNull();
    expect(rowTint(task(), "due", now)).toBeNull();
  });
});

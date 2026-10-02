import { describe, expect, it } from "vitest";
import { type StandupLabels, standupMarkdown } from "./standup";

const labels: StandupLabels = {
  yesterday: "Ayer",
  today: "Hoy",
  blockers: "Bloqueos",
  nothingDone: "Nada terminado",
  nothingPlanned: "Nada planificado",
  noBlockers: "Ninguno",
  day: (key) => `día ${key}`,
};

describe("standupMarkdown", () => {
  it("lists yesterday, today with key tasks marked, and each blocker line", () => {
    expect(
      standupMarkdown(
        {
          yesterday: {
            day: "2026-10-01",
            done: [
              {
                number: 12,
                title: "Revisar planos",
                projectSlug: "OBR",
                keyRank: null,
              },
            ],
          },
          today: {
            day: "2026-10-02",
            planned: [
              {
                number: 14,
                title: "Pedir material",
                projectSlug: "OBR",
                keyRank: 1,
              },
              {
                number: null,
                title: "Sin numero",
                projectSlug: "BAN",
                keyRank: null,
              },
            ],
          },
          blockers: "Esperando al proveedor\n\n  Falta el permiso  ",
        },
        labels,
      ),
    ).toBe(
      [
        "**Ayer** · día 2026-10-01",
        "- Revisar planos (OBR-12)",
        "",
        "**Hoy** · día 2026-10-02",
        "- ★ Pedir material (OBR-14)",
        "- Sin numero",
        "",
        "**Bloqueos**",
        "- Esperando al proveedor",
        "- Falta el permiso",
      ].join("\n"),
    );
  });

  it("says so when there is nothing", () => {
    expect(
      standupMarkdown(
        {
          yesterday: { day: "2026-10-01", done: [] },
          today: { day: "2026-10-02", planned: [] },
          blockers: null,
        },
        labels,
      ),
    ).toBe(
      [
        "**Ayer** · día 2026-10-01",
        "- Nada terminado",
        "",
        "**Hoy** · día 2026-10-02",
        "- Nada planificado",
        "",
        "**Bloqueos**",
        "- Ninguno",
      ].join("\n"),
    );
  });
});

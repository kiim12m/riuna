import { describe, expect, it } from "vitest";
import { chatMarkup } from "../../../apps/api/src/automation/actions/outbound";
import {
  STANDUP_LABELS_ES,
  standupMarkdown as standupMarkdownApi,
} from "../../../apps/api/src/review/standup-text";
// La implementacion del web, importada a proposito: es lo unico que impide que
// las dos copias diverjan (ver `review/standup-text.ts`).
import { standupMarkdown as standupMarkdownWeb } from "../../../apps/web/src/lib/standup";

const CASES = [
  {
    name: "a full day",
    data: {
      yesterday: {
        day: "2026-10-05",
        done: [
          { number: 12, title: "Medir", projectSlug: "OBR", keyRank: null },
          { number: null, title: "Llamar", projectSlug: "OBR", keyRank: 1 },
        ],
      },
      today: {
        day: "2026-10-06",
        planned: [
          { number: 3, title: "Pedir", projectSlug: "COM", keyRank: 2 },
        ],
      },
      blockers: "Falta el plano\n\n  Sin acceso a la obra  ",
    },
  },
  {
    name: "an empty day",
    data: {
      yesterday: { day: "2026-10-05", done: [] },
      today: { day: "2026-10-06", planned: [] },
      blockers: null,
    },
  },
];

describe("standup text parity (web ↔ API)", () => {
  for (const { name, data } of CASES) {
    it(`renders ${name} the same in both`, () => {
      expect(standupMarkdownApi(data, STANDUP_LABELS_ES)).toBe(
        standupMarkdownWeb(data, STANDUP_LABELS_ES),
      );
    });
  }

  it("labels a day the way it reads in Spanish", () => {
    expect(STANDUP_LABELS_ES.day("2026-10-01")).toBe("jue, 1 oct");
  });
});

describe("chatMarkup", () => {
  const text = "**Stand-up de Obras** · lun\n\n**Lucía**\n- Medir";

  it("keeps Markdown bold for Discord, single asterisks for Slack, none for Telegram", () => {
    expect(chatMarkup(text, "discord")).toBe(text);
    expect(chatMarkup(text, "slack")).toBe(
      "*Stand-up de Obras* · lun\n\n*Lucía*\n- Medir",
    );
    expect(chatMarkup(text, "telegram")).toBe(
      "Stand-up de Obras · lun\n\nLucía\n- Medir",
    );
  });
});

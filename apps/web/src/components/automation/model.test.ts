import { describe, expect, it } from "vitest";
import type { AutomationInput } from "@/fetchers/automation";
import { actionTypesFor, moveItem, newAction, RECIPES, toInput } from "./model";

const draft = (actions: AutomationInput["actions"]): AutomationInput => ({
  name: "  Avisar  ",
  trigger: { type: "task.created" },
  conditions: [],
  actions,
});

describe("toInput", () => {
  it("leaves an untouched secret out, so the saved one is kept", () => {
    const [webhook] = toInput(
      draft([{ id: "w", type: "webhook", url: "https://x.test", secret: "" }]),
    ).actions;
    expect(webhook).not.toHaveProperty("secret");
  });

  it("sends a secret that was typed, and trims the name", () => {
    const input = toInput(
      draft([{ id: "w", type: "webhook", url: "https://x.test", secret: "s" }]),
    );
    expect(input.name).toBe("Avisar");
    expect(input.actions[0]).toHaveProperty("secret", "s");
  });

  it("does the same with a chat destination", () => {
    const [chat] = toInput(
      draft([
        {
          id: "c",
          type: "chat",
          channel: "telegram",
          message: "Hola",
          destination: { botToken: "", chatId: "42", hasBotToken: true },
        },
      ]),
    ).actions;
    expect(chat).toMatchObject({ destination: { chatId: "42" } });
    expect(
      chat && "destination" in chat && chat.destination,
    ).not.toHaveProperty("botToken");
  });
});

describe("editor model", () => {
  it("a workspace rule cannot move to a column", () => {
    expect(actionTypesFor("workspace")).not.toContain("move");
    expect(actionTypesFor("project")).toContain("move");
    expect(actionTypesFor("project")).not.toContain("standup");
  });

  it("moves an action up and down, and ignores moves off the ends", () => {
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("every new action has its own id", () => {
    expect(newAction("notify").id).not.toBe(newAction("notify").id);
  });

  it("every recipe builds a rule with a name and at least one action", () => {
    for (const recipe of RECIPES) {
      const built = recipe.build({ name: recipe.key, message: "Hecho" });
      expect(built.name).toBe(recipe.key);
      expect(built.actions.length).toBeGreaterThan(0);
    }
  });
});

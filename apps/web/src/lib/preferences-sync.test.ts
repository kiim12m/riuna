import { describe, expect, it } from "vitest";
import { useUserPreferencesStore } from "@/store/user-preferences";
import {
  applicableFromServer,
  changedKeys,
  differingFromDefaults,
  pickSynced,
  SYNCED_DEFAULTS,
  SYNCED_KEYS,
  type SyncedKey,
} from "./preferences-sync";

describe("preferences sync", () => {
  // Si los valores de partida de aqui y del almacen se separan, «lo que se sube
  // la primera vez» dejaria de significar lo que dice.
  it("keeps its defaults equal to the store's initial state", () => {
    const initial = useUserPreferencesStore.getInitialState();
    for (const key of SYNCED_KEYS) {
      expect(initial[key], key).toBe(SYNCED_DEFAULTS[key]);
    }
  });

  it("never carries the theme, which belongs to the device", () => {
    expect(SYNCED_KEYS).not.toContain("theme");
    expect(
      pickSynced({ ...SYNCED_DEFAULTS, theme: "light" } as never),
    ).not.toHaveProperty("theme");
  });

  it("reports only what changed, only among synced keys", () => {
    expect(
      changedKeys(
        { ...SYNCED_DEFAULTS },
        { ...SYNCED_DEFAULTS, weekStartsOn: 1, compactMode: true },
      ).sort(),
    ).toEqual(["compactMode", "weekStartsOn"]);
  });

  it("applies the server's values except what was touched here meanwhile", () => {
    const touched = new Set<SyncedKey>(["viewMode"]);

    expect(
      applicableFromServer(
        { viewMode: "list", weekStartsOn: 6, showLabels: false },
        touched,
      ),
    ).toEqual({ weekStartsOn: 6, showLabels: false });
  });

  it("ignores a server value that is not valid for its key", () => {
    expect(
      applicableFromServer(
        {
          weekStartsOn: 3 as never,
          viewMode: "grid" as never,
          compactMode: "yes" as never,
          showLabels: false,
        },
        new Set(),
      ),
    ).toEqual({ showLabels: false });
  });

  it("uploads on first use only what the person had changed", () => {
    expect(
      differingFromDefaults({
        ...SYNCED_DEFAULTS,
        weekStartsOn: 1,
        showPriority: false,
      }),
    ).toEqual({ weekStartsOn: 1, showPriority: false });
    expect(differingFromDefaults({ ...SYNCED_DEFAULTS })).toEqual({});
  });
});

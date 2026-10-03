import { create } from "zustand";
import {
  browserNotifyEnabled,
  disableBrowserNotify,
  enableBrowserNotify,
  readNudgePreferences,
  writeNudgePreferences,
} from "@/lib/browser-notify";
import type {
  NudgeKind,
  NudgePreferences,
} from "@/lib/reminders/workday-nudges";

/**
 * Si los avisos del navegador estan activados, y que avisos de ritmo se
 * quieren, como estado de React: los ajustes los cambian y el runtime del
 * espacio los lee sin recargar.
 */
type BrowserNotifyState = {
  enabled: boolean;
  nudges: NudgePreferences;
  enable: () => Promise<NotificationPermission | "unsupported">;
  disable: () => void;
  setNudge: (kind: NudgeKind, on: boolean) => void;
};

export const useBrowserNotifyStore = create<BrowserNotifyState>((set, get) => ({
  enabled: typeof window !== "undefined" && browserNotifyEnabled(),
  nudges:
    typeof window === "undefined"
      ? { break: false, idle: false, overtime: false }
      : readNudgePreferences(),
  enable: async () => {
    const permission = await enableBrowserNotify();
    set({ enabled: permission === "granted" });
    return permission;
  },
  disable: () => {
    disableBrowserNotify();
    set({ enabled: false });
  },
  setNudge: (kind, on) => {
    const nudges = { ...get().nudges, [kind]: on };
    writeNudgePreferences(nudges);
    set({ nudges });
  },
}));

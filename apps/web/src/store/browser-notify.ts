import { create } from "zustand";
import {
  browserNotifyEnabled,
  disableBrowserNotify,
  enableBrowserNotify,
} from "@/lib/browser-notify";

/**
 * Si los avisos del navegador estan activados, como estado de React: los
 * ajustes los cambian y el runtime del espacio los lee sin recargar.
 */
type BrowserNotifyState = {
  enabled: boolean;
  enable: () => Promise<NotificationPermission | "unsupported">;
  disable: () => void;
};

export const useBrowserNotifyStore = create<BrowserNotifyState>((set) => ({
  enabled: typeof window !== "undefined" && browserNotifyEnabled(),
  enable: async () => {
    const permission = await enableBrowserNotify();
    set({ enabled: permission === "granted" });
    return permission;
  },
  disable: () => {
    disableBrowserNotify();
    set({ enabled: false });
  },
}));

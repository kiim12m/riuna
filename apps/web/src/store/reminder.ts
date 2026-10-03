import { create } from "zustand";
import type { TodayPlanned } from "@/fetchers/today";

/** El aviso abierto en el dialogo, tras pulsar la notificacion (ADR 055). */
type ReminderState = {
  entry: TodayPlanned | null;
  open: (entry: TodayPlanned) => void;
  close: () => void;
};

export const useReminderStore = create<ReminderState>((set) => ({
  entry: null,
  open: (entry) => set({ entry }),
  close: () => set({ entry: null }),
}));

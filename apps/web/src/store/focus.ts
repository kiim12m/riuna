import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FocusSession } from "@/lib/focus/machine";

const STORAGE_KEY = "riuna:focus";

/**
 * La sesion de foco en curso (ADR 056). Se guarda en este navegador para
 * sobrevivir a una recarga, y las pestañas se la pasan por el evento
 * `storage`. El cronometro del servidor sigue mandando: esto solo recuerda la
 * fase y cuando acaba.
 */
type FocusState = {
  session: FocusSession | null;
  setSession: (session: FocusSession) => void;
  clear: () => void;
};

export const useFocusStore = create<FocusState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clear: () => set({ session: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session }),
    },
  ),
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) void useFocusStore.persist.rehydrate();
  });
}

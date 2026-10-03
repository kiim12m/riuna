import { create } from "zustand";

/**
 * Si el dialogo de atajos esta abierto. La paleta lo abria despachando un
 * `keydown "?"` sintetico sobre `document`; el proveedor de atajos, que
 * escucha ahi, lo tomaba por una tecla y ejecutaba el atajo `?` que la propia
 * paleta registraba -que despachaba otro `?`-: una recursion sin fin. Ahora la
 * paleta abre la ayuda por aqui, sin eventos de por medio.
 */
type ShortcutsHelpState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useShortcutsHelpStore = create<ShortcutsHelpState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

import { create } from "zustand";

/**
 * Si el dialogo de captura rapida esta abierto. Lo abren la tecla `q` y la
 * paleta, que no comparten arbol de componentes con el dialogo.
 */
type QuickAddState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useQuickAddStore = create<QuickAddState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

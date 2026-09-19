import { create } from "zustand";

// Marca §06 principio 5: "lo que es en tiempo real, lo parece". El servidor
// excluye a la ventana que originó el cambio (ws/index.ts), así que un pulso
// aquí siempre viene de otra persona u otra pestaña, nunca de un cambio propio.
interface RealtimeHighlightState {
  // taskId -> contador que sube en cada cambio remoto de esa tarea. Las
  // tarjetas lo miran con un efecto y disparan su propia animación.
  pulses: Record<string, number>;
  pulse: (taskId: string) => void;
}

const useRealtimeHighlightStore = create<RealtimeHighlightState>((set) => ({
  pulses: {},
  pulse: (taskId) =>
    set((state) => ({
      pulses: {
        ...state.pulses,
        [taskId]: (state.pulses[taskId] ?? 0) + 1,
      },
    })),
}));

export default useRealtimeHighlightStore;

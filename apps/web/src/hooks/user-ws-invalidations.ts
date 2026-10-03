import type { QueryKey } from "@tanstack/react-query";

export type UserWsMessage = {
  type?: string;
  workspaceId?: string;
};

/**
 * Los mensajes que llegan en rafaga: `PATCH /task/bulk` publica un evento
 * **por tarea**, asi que asignar veinte de golpe serian veinte refetchs de la
 * misma consulta. `useUserWebSocket` los junta en una ventana corta.
 */
export const DEBOUNCED_USER_MESSAGES: ReadonlySet<string> = new Set([
  "MY_WORK_INVALIDATED",
]);

/**
 * Que claves invalida cada mensaje del canal de usuario (ADR 048).
 *
 * Funcion pura y en su propio fichero porque la lista ya se habia quedado
 * corta dos veces sin que nada lo viera: una tarea recien asignada no llegaba
 * a Hoy ni a "Sin planificar" -`MY_WORK_INVALIDATED` solo tocaba `my-work` y
 * los paneles-, y parar el cronometro no refrescaba lo registrado que ensena
 * el Planificador. Las claves son prefijos: `["my-work"]` cubre tambien los
 * contadores de la barra y las busquedas de Mis tareas.
 */
export function userMessageInvalidations(message: UserWsMessage): QueryKey[] {
  switch (message.type) {
    case "NOTIFICATION_CREATED":
      return [["notifications"]];
    // Cambia **si una tarea es tuya** -asignar, desasignar, el equipo, el
    // estado o borrarla-, que es lo que decide si sale en Hoy (urgente,
    // hechas), en "Sin planificar" del Planificador y en el Cronograma, ademas
    // de en Mis tareas y los paneles. El resto del contenido -prioridad,
    // fecha, titulo- no se empuja: dispara en cada arrastre (ADR 024).
    case "MY_WORK_INVALIDATED":
      return [
        ["my-work"],
        ["dashboard-data"],
        ["today"],
        ["planner"],
        ["schedule"],
      ];
    // El plan personal lo leen el Planificador, el Cronograma (ADR 041), Hoy
    // (ADR 047) y el contador de "Hoy" de la barra.
    case "PLAN_INVALIDATED":
      return [["planner"], ["schedule"], ["today"], ["my-work", "counts"]];
    // Un bloque fijo o la jornada cambian la capacidad y los bloques que el
    // Planificador y Hoy tambien leen (ADR 045).
    case "SCHEDULE_INVALIDATED":
      return [["schedule"], ["planner"], ["today"]];
    // Arrancar, parar -a mano o porque la tarea entro en una columna final- y
    // editar o borrar una entrada (ADR 044). El Planificador ensena lo
    // registrado de cada tarjeta, asi que tambien.
    case "TIMER_CHANGED":
      return [
        ["time-entry"],
        ["schedule"],
        ["time-sheet"],
        ["today"],
        ["planner"],
        ["my-work", "counts"],
      ];
    // Una vista de espacio sin proyecto no tiene socket de proyecto que la
    // escuche. El prefijo cubre `["workspace-views", workspaceId, type]`.
    case "VIEW_UPDATED":
      return message.workspaceId
        ? [["workspace-views", message.workspaceId]]
        : [];
    default:
      return [];
  }
}

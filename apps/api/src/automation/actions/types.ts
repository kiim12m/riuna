import type { automationTable } from "../../database/schema";
import type { TaskInfo } from "../task-info";

export type ActionContext = {
  rule: typeof automationTable.$inferSelect;
  /** La tarea como esta justo antes de esta accion. */
  task: TaskInfo;
  /** En nombre de quien actua: quien guardo la regla. */
  actorId: string;
  eventType: string;
};

/** Lo que una accion deja apuntado en el historial, ademas de que fue bien. */
export type ActionOutcome = Record<string, unknown> | undefined;

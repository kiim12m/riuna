import type { Action } from "../definition";
import { runInternalAction } from "./internal";
import { runOutboundAction } from "./outbound";
import type { ActionContext, ActionOutcome } from "./types";

export async function runAction(
  action: Action,
  context: ActionContext,
): Promise<ActionOutcome> {
  switch (action.type) {
    case "notify":
    case "webhook":
    case "chat":
      return runOutboundAction(action, context);
    case "standup":
      // No actua sobre una tarea: lo envia el planificador (`scheduled.ts`).
      throw new Error("A stand-up is sent on schedule, not on a task");
    default:
      return runInternalAction(action, context);
  }
}

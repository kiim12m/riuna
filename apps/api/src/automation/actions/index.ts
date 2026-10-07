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
    default:
      return runInternalAction(action, context);
  }
}

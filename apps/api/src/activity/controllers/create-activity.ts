import db from "../../database";
import { activityTable } from "../../database/schema";
import { eventContext } from "../../events";

async function createActivity(
  taskId: string,
  type: string,
  userId: string,
  content: string | null,
  eventData?: Record<string, unknown> | null,
) {
  // Un cambio que hizo una automatizacion (ADR 067) lleva su marca: la
  // actividad la nombra a ella como autora y no a quien la guardo. Los
  // gestores corren en el contexto de quien publico, asi que se lee de ahi.
  const automation = eventContext.getStore()?.automation;
  const data = automation
    ? { ...eventData, automation: { id: automation.id, name: automation.name } }
    : (eventData ?? null);

  const [activity] = await db
    .insert(activityTable)
    .values({
      taskId,
      type,
      userId,
      content,
      eventData: data,
    })
    .returning();
  return activity;
}

export default createActivity;

import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, workflowRuleTable } from "../../database/schema";

async function upsertWorkflowRule({
  projectId,
  integrationType,
  eventType,
  columnId,
}: {
  projectId: string;
  integrationType: string;
  eventType: string;
  columnId: string;
}) {
  const targetColumn = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.id, columnId),
      eq(columnTable.projectId, projectId),
    ),
  });

  if (!targetColumn) {
    throw new HTTPException(400, {
      message: "Column does not belong to the provided project",
    });
  }

  // Un solo `INSERT … ON CONFLICT` contra el indice unico: leer y luego
  // escribir dejaba dos filas cuando dos guardados del mismo evento se
  // cruzaban.
  const [rule] = await db
    .insert(workflowRuleTable)
    .values({
      projectId,
      integrationType,
      eventType,
      columnId,
    })
    .onConflictDoUpdate({
      target: [
        workflowRuleTable.projectId,
        workflowRuleTable.integrationType,
        workflowRuleTable.eventType,
      ],
      set: { columnId, updatedAt: new Date() },
    })
    .returning();

  if (!rule) {
    throw new HTTPException(500, {
      message: "Failed to save workflow rule",
    });
  }

  return rule;
}

export default upsertWorkflowRule;

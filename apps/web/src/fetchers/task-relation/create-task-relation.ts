import { client } from "@riuna/libs";

async function createTaskRelation({
  sourceTaskId,
  targetTaskId,
  relationType,
  lag,
}: {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: "blocks" | "related" | "precedes";
  /** Solo con `precedes`: dias laborables, negativo para solapar (ADR 084). */
  lag?: number;
}) {
  const response = await client["task-relation"].$post({
    json: {
      sourceTaskId,
      targetTaskId,
      relationType,
      ...(relationType === "precedes" && lag !== undefined ? { lag } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default createTaskRelation;

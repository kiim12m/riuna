import { client } from "@riuna/libs";

// El fichero se sube dos veces —una para analizar y otra para importar— a
// proposito: la alternativa era guardarlo en el servidor entre los dos pasos, y
// eso es estado que caducar y que no sobrevive a una segunda instancia de la
// API. El `File` vive en el estado del componente, asi que quien importa lo
// elige una sola vez.

async function analyzeImport(projectId: string, file: File, source?: string) {
  const response = await client.task.import[":projectId"].analyze.$post({
    param: { projectId },
    form: { file, ...(source ? { source } : {}) },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default analyzeImport;

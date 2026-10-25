import { describe, expect, it } from "vitest";
import { registerMcpTools } from "../../apps/api/src/mcp/tools";

type Registered = Map<string, string[]>;

/**
 * Lo que un registro da de alta, con un servidor que solo escucha: cada
 * herramienta con los nombres de sus parametros.
 */
function collect(
  register: (server: {
    registerTool: (name: string, config: { inputSchema: unknown }) => void;
  }) => void,
): Registered {
  const tools: Registered = new Map();
  register({
    registerTool: (name, config) => {
      const schema = config.inputSchema as { shape?: object } | object;
      const shape = "shape" in schema && schema.shape ? schema.shape : schema;
      tools.set(name, Object.keys(shape).sort());
    },
  });
  return tools;
}

// Hasta la ADR 099 habia dos caminos (HTTP y el paquete stdio) y esta prueba
// vigilaba que prometieran lo mismo. Ahora solo queda el HTTP, pero que
// `create_task` ganara asignados, equipo y campos sin que nada lo notara es
// justo lo que una herramienta puede volver a perder.
describe("MCP tool parameters", () => {
  const tools = collect((server) =>
    registerMcpTools(server as never, "http://localhost", "token"),
  );

  it("registers the tools", () => {
    expect(tools.size).toBeGreaterThan(40);
  });

  it("keeps the parameters that create and update a task", () => {
    for (const name of ["create_task", "update_task"]) {
      expect(tools.get(name)).toEqual(
        expect.arrayContaining(["customFields", "assigneeIds", "teamId"]),
      );
    }
    expect(tools.get("list_tasks")).toEqual(
      expect.arrayContaining(["filter", "treeScope"]),
    );
  });
});

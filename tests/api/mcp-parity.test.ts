import { describe, expect, it } from "vitest";
import { registerMcpTools } from "../../apps/api/src/mcp/tools";
import { registerTools } from "../../packages/mcp/src/tools/register";

type Registered = Map<string, string[]>;

/**
 * Lo que un registro da de alta, con un servidor que solo escucha: cada
 * herramienta con los nombres de sus parametros. Los HTTP y stdio dan el
 * esquema de forma distinta (un objeto Zod o su forma), de ahi el `shape`.
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

function toolNames(tools: Registered) {
  return [...tools.keys()].sort();
}

/**
 * Los dos caminos de MCP -el servidor HTTP de la API y el paquete stdio
 * `@riuna/mcp`- prometen las mismas herramientas (`funcionalidades.md`), y
 * nada lo vigilaba: el HTTP gano `get_plan`, `plan_task` y las tres del
 * cronometro sin que el paquete las tuviera (interludio de productividad,
 * sub-bloque 0.5). Esta prueba falla en cuanto uno gana una que el otro no.
 */
describe("MCP tool parity", () => {
  it("registers the same tools over HTTP and stdio", () => {
    const http = collect((server) =>
      registerMcpTools(server as never, "http://localhost", "token"),
    );
    const stdio = collect((server) =>
      registerTools(server as never, {
        client: { json: async () => ({}) } as never,
      }),
    );

    expect(toolNames(stdio)).toEqual(toolNames(http));
    expect(http.size).toBeGreaterThan(40);
  });

  // Que tengan el mismo nombre no basta: `create_task` ganó asignados, equipo y
  // campos en uno y los habria perdido el otro sin que nada lo notara.
  it("takes the same parameters in every tool, over HTTP and stdio", () => {
    const http = collect((server) =>
      registerMcpTools(server as never, "http://localhost", "token"),
    );
    const stdio = collect((server) =>
      registerTools(server as never, {
        client: { json: async () => ({}) } as never,
      }),
    );

    for (const [name, parameters] of http) {
      expect({ name, parameters: stdio.get(name) }).toEqual({
        name,
        parameters,
      });
    }
    for (const name of ["create_task", "update_task"]) {
      expect(http.get(name)).toEqual(
        expect.arrayContaining(["customFields", "assigneeIds", "teamId"]),
      );
    }
    expect(http.get("list_tasks")).toEqual(
      expect.arrayContaining(["filter", "treeScope"]),
    );
  });
});

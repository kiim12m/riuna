import { describe, expect, it } from "vitest";
import { registerMcpTools } from "../../apps/api/src/mcp/tools";
import { registerTools } from "../../packages/mcp/src/tools/register";

/** Los nombres que un registro da de alta, con un servidor que solo escucha. */
function toolNames(
  register: (server: { registerTool: (name: string) => void }) => void,
) {
  const names = new Set<string>();
  register({ registerTool: (name: string) => names.add(name) });
  return [...names].sort();
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
    const http = toolNames((server) =>
      registerMcpTools(server as never, "http://localhost", "token"),
    );
    const stdio = toolNames((server) =>
      registerTools(server as never, {
        client: { json: async () => ({}) } as never,
      }),
    );

    expect(stdio).toEqual(http);
    expect(http.length).toBeGreaterThan(40);
  });
});

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuthService } from "./auth/auth-service.js";
import { RiunaClient } from "./riuna/client.js";
import { registerTools } from "./tools/register.js";
import { normalizeBaseUrl } from "./utils/normalize-base-url.js";

const require = createRequire(import.meta.url);
const { version: packageVersion } = require("../package.json") as {
  version: string;
};

export function createMcpServer(): McpServer {
  const baseUrl = normalizeBaseUrl(
    process.env.RIUNA_API_URL || "http://localhost:1337",
  );
  const clientId = process.env.RIUNA_MCP_CLIENT_ID || "riuna-mcp";
  const apiKey = process.env.RIUNA_API_KEY || undefined;
  const auth = new AuthService({ baseUrl, clientId, apiKey });
  const client = new RiunaClient({ baseUrl, auth });
  const server = new McpServer({
    name: "riuna-mcp",
    version: packageVersion,
  });
  registerTools(server, { client });
  return server;
}

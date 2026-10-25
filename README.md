# Riuna

Riuna is a self-hosted, all-in-one productivity platform: project and task
management first, with a light CRM and ERP planned later. It is a hard fork
of [Kaneo](https://github.com/usekaneo/kaneo) (MIT), maintained as an
independent, internal program. See [`NOTICE`](NOTICE) for attribution and
[`AGENTS.md`](AGENTS.md) for the full operating guide.

**What it is:**
- **Clean interface** that focuses on your work, not the tool
- **Self-hosted** so your data stays yours
- **Open source** under a permissive MIT license

## Getting Started

### Deployment

Riuna is deployed from source with Docker Compose: [`compose.local.yml`](compose.local.yml)
builds the API and web images on the machine and runs them next to PostgreSQL and
the backup service. See [`docs/actualizar.md`](docs/actualizar.md) for how the
running instance is rebuilt and updated, and
[`docs/copias-de-seguridad.md`](docs/copias-de-seguridad.md) for backups.

### Development Setup

See [`ENVIRONMENT_SETUP.md`](ENVIRONMENT_SETUP.md) for configuring
environment variables and troubleshooting common issues like CORS problems.

Quick start:
```bash
pnpm install

# Create a .env file in the root with required environment variables
# See ENVIRONMENT_SETUP.md for detailed instructions

# Start development servers
pnpm dev
```

For contributing guidelines, code structure, and development best practices,
see [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md).

### Configuration

Riuna requires several environment variables to be configured — see
[`ENVIRONMENT_SETUP.md`](ENVIRONMENT_SETUP.md) for the complete list.

## MCP Server

Every instance ships a built-in HTTP MCP endpoint at `/api/mcp`, so AI tools
like Claude, Cursor, and other MCP clients can manage tasks, projects, and
labels. For stdio clients there is also the [`@riuna/mcp`](packages/mcp)
package, built from source (see its own README).

## License

MIT License — see [`LICENSE`](LICENSE) for the original Kaneo license text
and [`NOTICE`](NOTICE) for how it applies to Riuna's modifications.

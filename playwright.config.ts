import { defineConfig, devices } from "@playwright/test";

/**
 * Humo de punta a punta.
 *
 * `AGENTS.md` pide una pasada por navegador para los flujos visibles, y el plan
 * la lleva prometiendo desde la Fase 0 —«se aprovecha la infraestructura de
 * pruebas heredada… Playwright»— sin que existiera. Las Fases 4, 5 y 6 la
 * declararon como deuda una detras de otra. Esto es lo que la cierra.
 *
 * **Levanta su propio par API + web contra una base propia.** Correr contra el
 * entorno de desarrollo de quien programa dejaria espacios y proyectos de
 * prueba entre sus datos reales, y ademas ataria el resultado a lo que hubiera
 * en esa base ese dia.
 *
 * Los dos servidores se lanzan por separado y no con `pnpm dev`: con la salida
 * redirigida y mas de una tarea persistente, turbo se queda colgado sin abrir el
 * puerto. Esta anotado en la skill `verify` y aqui se respeta.
 */
// La zona de produccion (ADR 049), para el proceso que lanza las pruebas -sus
// fechas de ayuda- y para la API, que la hereda del entorno. El navegador va
// aparte, con `timezoneId`: es donde vive quien usa Riuna.
process.env.TZ = "Europe/Madrid";

const API_PORT = 1338;
const WEB_PORT = 5174;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/riuna_e2e_test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Una a una: comparten instancia y base, asi que el paralelismo solo traeria
  // interferencias entre pruebas que no aportan nada.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // El idioma de producto es el español (`AGENTS.md`), pero el idioma sale de
    // `user.locale → navegador → por defecto`, y Chromium arranca en `en-US`.
    // Sin esto el humo mediria una interfaz que ningun usuario de Riuna ve.
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // `tsx` a secas, **no** `pnpm dev` (que es `tsx watch`). Con la salida
      // redirigida —que es como la lanza Playwright— `tsx watch` imprime su
      // banner y no llega a abrir el puerto nunca. Esta anotado en la skill
      // `verify` y es lo que hizo fallar el primer intento de montar esto.
      // Para una pasada de humo el modo vigilancia no aporta nada.
      command: "pnpm --filter @riuna/api exec tsx src/index.ts",
      port: API_PORT,
      // Las migraciones corren al arrancar; en una base vacia tardan.
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL,
        PORT: String(API_PORT),
        NODE_ENV: "development",
        TZ: "Europe/Madrid",
        AUTH_SECRET: "e2e-secret-with-at-least-32-characters",
        // Las automatizaciones guardan cifrados sus destinos de chat (ADR 066).
        // En local saldria del `.env`; en CI no hay `.env`.
        NOTIFICATION_SECRET_ENCRYPTION_KEY: "e2e-notification-secret-key",
        RIUNA_API_URL: `http://localhost:${API_PORT}`,
        RIUNA_CLIENT_URL: `http://localhost:${WEB_PORT}`,
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        DISABLE_REGISTRATION: "false",
        DISABLE_PASSWORD_REGISTRATION: "false",
        DEMO_MODE: "false",
      },
    },
    {
      // El puerto va por linea de ordenes y **no** por `PORT`: Vite no lee esa
      // variable, y `vite.config.ts` fija 5173 a fuego. Con `PORT` en el
      // entorno el servidor abria 5173, Playwright esperaba 5174 y el humo
      // moria en el arranque sin llegar a ninguna prueba. `--strictPort` hace
      // que un puerto ocupado falle en vez de elegir otro y repetir el enredo.
      // Sin `--`: pnpm 10 reenvia los argumentos tal cual, y con el llegaban
      // literales a Vite, que los ignoraba y volvia a abrir 5173.
      command: `pnpm --filter @riuna/web dev --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        VITE_API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
});

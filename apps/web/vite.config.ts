import path from "node:path";
import babel from "@rolldown/plugin-babel";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import packageJson from "../../package.json";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  base: "/",
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      // Keep co-located route tests out of the generated route tree.
      routeFileIgnorePattern: "\\.test\\.tsx?$",
    }),
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Hidden when Sentry env vars are absent so local dev does not depend on it.
    ...(sentryAuthToken && sentryOrg && sentryProject
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: sentryOrg,
            project: sentryProject,
            release: { name: packageJson.version },
          }),
        ]
      : []),
  ],
  server: {
    host: true,
    hmr: true,
    // El 5173 de siempre, salvo que se pida otro. `pnpm dev:parallel` lo mueve
    // para poder convivir con la instancia de Docker, que ya ocupa ese puerto.
    port: Number(process.env.DEV_WEB_PORT) || 5173,
    // Solo cuando se ha pedido un puerto concreto: ahi, caerse es mejor que
    // saltar al siguiente libre, porque el numero esta en el reenvio del
    // devcontainer y en el origen de confianza de la API.
    strictPort: Boolean(process.env.DEV_WEB_PORT),
    // La API, servida por debajo del propio servidor de desarrollo.
    //
    // Sin esto el navegador tiene que alcanzar **dos** puertos: el 5173 de la
    // web y el 1337 de la API, que va grabada en el bundle como URL absoluta.
    // En un devcontainer o un tunel eso falla en cuanto solo se reenvia uno de
    // los dos, y el sintoma es un `NetworkError` en `getSession` que no dice
    // de donde viene. Con el proxy basta con llegar al 5173.
    //
    // Solo se usa si `VITE_API_URL` vale `/`; con la URL absoluta de siempre,
    // el cliente ni pasa por aqui. Es configuracion del servidor de
    // desarrollo: no entra en la compilacion.
    proxy: {
      "/api": {
        target: process.env.DEV_PROXY_API_TARGET || "http://localhost:1337",
        changeOrigin: false,
        // Los WebSockets de tiempo real cuelgan de `/api`, asi que suben por
        // el mismo proxy.
        ws: true,
        configure: (proxy) => {
          // Better Auth valida el `Origin` contra `RIUNA_CLIENT_URL`, y aqui
          // el origen real es el que use cada quien —localhost, una IP de la
          // red, un tunel—. Reescribirlo a la URL de confianza deja que el
          // servidor siga siendo estricto sin tener que enumerar de antemano
          // todas las formas de llegar a un entorno de desarrollo.
          const trusted =
            process.env.DEV_PROXY_ORIGIN || "http://localhost:5173";
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("origin", trusted);
          });
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["better-auth"],
  },
  ssr: {
    noExternal: ["better-auth"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@i18n": path.resolve(__dirname, "../../i18n"),
    },
  },
  build: {
    // Source maps are required for the Sentry Vite plugin to upload and
    // symbolicate stack traces. Hidden so the .map files are not served
    // to end users; the Sentry plugin still attaches them to uploaded
    // releases.
    sourcemap: "hidden",
    rollupOptions: {},
    commonjsOptions: {
      include: [/better-auth/, /node_modules/],
      transformMixedEsModules: true,
    },
    target: "esnext",
  },
});

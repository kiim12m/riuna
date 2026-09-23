import { apiKeyClient } from "@better-auth/api-key/client";
import {
  adminClient,
  anonymousClient,
  deviceAuthorizationClient,
  emailOTPClient,
  genericOAuthClient,
  inferAdditionalFields,
  lastLoginMethodClient,
  magicLinkClient,
  organizationClient,
  usernameClient,
} from "better-auth/client/plugins";
import type { AccessControl } from "better-auth/plugins/access";
import { createAuthClient } from "better-auth/react";
import { ac, admin, member, owner, viewer } from "./permissions";

/**
 * `VITE_API_URL` admite una URL absoluta o una relativa.
 *
 * Relativa significa "el mismo origen que la pagina", que es lo que hace falta
 * cuando la API se sirve por debajo del servidor de desarrollo: asi el
 * navegador solo necesita alcanzar un puerto y la direccion por la que se
 * entra —localhost, una IP de la red, un tunel— deja de estar grabada en el
 * bundle. Better Auth exige una base absoluta, asi que se resuelve contra el
 * origen actual en vez de pasarle la relativa tal cual.
 */
const getBaseURL = () => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:1337";

  // Solo un valor que **empieza por barra** se trata como relativo. Resolver
  // cualquier cadena contra el origen haria que un `VITE_API_URL` mal puesto
  // —por ejemplo el marcador `RIUNA_API_URL` de `.env.production` si nadie lo
  // sustituye al arrancar— dejara de fallar y apuntara en silencio a la propia
  // pagina. Mejor que reviente donde se ve.
  if (apiUrl.startsWith("/") && typeof window !== "undefined") {
    return window.location.origin;
  }

  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return apiUrl.split("/").slice(0, 3).join("/");
  }
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  basePath: "/api/auth",
  plugins: [
    anonymousClient(),
    lastLoginMethodClient(),
    magicLinkClient(),
    emailOTPClient(),
    organizationClient({
      // Same widening as the server plugin in `apps/api/src/auth.ts`: our
      // narrow `statement` shape makes `ac`'s inferred `newRole` generic
      // incompatible with better-auth's looser `AccessControl` type.
      ac: ac as AccessControl,
      roles: {
        viewer,
        member,
        admin,
        owner,
      },
      dynamicAccessControl: {
        enabled: true,
      },
      // Debe reflejar `teams` del plugin de organizacion del servidor
      // (apps/api/src/auth.ts): sin esto el cliente no expone listTeams ni
      // el resto de metodos de equipo, aunque el servidor si los sirva.
      teams: {
        enabled: true,
      },
    }),
    genericOAuthClient(),
    deviceAuthorizationClient(),
    apiKeyClient(),
    adminClient(),
    // Refleja el plugin `username` del servidor: sin esto no existe
    // signIn.username y las cuentas locales no podrian entrar.
    usernameClient(),
    inferAdditionalFields({
      user: {
        locale: {
          type: "string",
          required: false,
          input: true,
        },
        isLocalAccount: {
          type: "boolean",
          required: false,
          input: false,
        },
      },
    }),
  ],
});

import { createFileRoute } from "@tanstack/react-router";
import { redirectToAdmin } from "@/lib/legacy-settings-redirect";

/** Cualquier subruta de la vieja pantalla de ajustes de projects. */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/projects/$",
)({
  // El destino tiene la misma forma que la ruta vieja
  // (`admin/project-settings/$projectId/{general,integrations,visibility,workflow}`),
  // asi que reenviar el resto tal cual funciona -igual que el hermano de espacio.
  beforeLoad: ({ params }) =>
    redirectToAdmin("project-settings", params._splat),
});

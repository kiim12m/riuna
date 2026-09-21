import { createFileRoute } from "@tanstack/react-router";
import { redirectToAdmin } from "@/lib/legacy-settings-redirect";

/** Cualquier subruta de la vieja pantalla de ajustes de projects. */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/projects/$",
)({
  beforeLoad: () => redirectToAdmin("project-settings"),
});

import { createFileRoute } from "@tanstack/react-router";
import { redirectToAdmin } from "@/lib/legacy-settings-redirect";

/** Cualquier subruta de la vieja pantalla de ajustes de workspace. */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/$",
)({
  // Las sub-paginas conservan su nombre (`general`, `roles`, `teams`,
  // `labels`), asi que el enlace viejo llega a la misma pagina.
  beforeLoad: ({ params }) => redirectToAdmin("workspace", params._splat),
});

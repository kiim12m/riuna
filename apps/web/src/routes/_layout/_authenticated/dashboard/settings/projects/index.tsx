import { createFileRoute } from "@tanstack/react-router";
import { redirectToAdmin } from "@/lib/legacy-settings-redirect";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/projects/",
)({
  beforeLoad: () => redirectToAdmin("project-settings"),
});

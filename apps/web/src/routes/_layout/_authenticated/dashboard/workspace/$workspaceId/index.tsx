import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * La raiz del espacio ya no es la tabla de proyectos.
 *
 * Esa tabla es una pantalla de gestion —crear, reordenar, archivar, borrar— y
 * se ha ido al grupo de administracion, que no todo el mundo ve. Como pantalla
 * de entrada ahora manda el espacio personal.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/workspace/$workspaceId/home",
      params,
      replace: true,
    });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * "Mis tareas" sin sub-ruta cae en Lista: es la mas barata de leer de las
 * cuatro, y la misma que encabeza el orden en la maqueta y en las pestanas.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-tasks/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/workspace/$workspaceId/my-tasks/list",
      params,
      replace: true,
    });
  },
});

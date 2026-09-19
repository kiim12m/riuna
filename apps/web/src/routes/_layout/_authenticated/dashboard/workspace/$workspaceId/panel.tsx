import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * «Panel» se funde en el panel personal.
 *
 * La ruta se queda como redireccion en vez de borrarse: los enlaces guardados y
 * las pestanas abiertas de quien ya usaba esta pantalla siguen llegando a algun
 * sitio, y llegan al que responde la misma pregunta.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/panel",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/workspace/$workspaceId/home",
      params,
      replace: true,
    });
  },
});

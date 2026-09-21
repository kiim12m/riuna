import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Ajustes sin mas es la informacion de la cuenta.
 *
 * Antes llegar aqui dejaba el contenido vacio y te salvaban las pestanas de
 * arriba; desde que solo queda la cuenta, esas pestanas ya no estan.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/",
)({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/settings/account/information",
      replace: true,
    });
  },
});

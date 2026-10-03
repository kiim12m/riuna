import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { ChevronLeft, PanelLeftIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { SettingsSidebarProvider } from "@/components/SettingsSidebar";
import { Button } from "@/components/ui/button";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Ajustes, que ahora son solo **los de la cuenta**.
 *
 * Las pestanas de espacio y de proyecto se fueron al grupo de administracion,
 * dentro del layout con barra lateral: son de administrar el espacio, no de la
 * persona. Lo que queda aqui —perfil, avisos, preferencias y claves de API— es
 * lo unico que de verdad pertenece a quien ha iniciado sesion, y por eso sigue
 * abriendose desde el menu de usuario y no desde la barra.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings",
)({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const { data: workspace } = useActiveWorkspace();

  useEffect(() => {
    if (location.pathname) {
      setSettingsMenuOpen(false);
    }
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (!isMobile) {
      setSettingsMenuOpen(false);
    }
  }, [isMobile]);

  return (
    <>
      <PageTitle title={t("navigation:page.settingsTitle")} />

      <div className="flex h-full w-full flex-col bg-sidebar p-2 sm:p-4">
        <div className="relative flex h-full min-h-0 flex-col gap-6 overflow-hidden rounded-md border border-border bg-card p-3 md:gap-4 sm:p-4">
          <div className="shrink-0">
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 md:hidden"
                aria-label="Open settings menu"
                title="Open settings menu"
                onClick={() => setSettingsMenuOpen(true)}
              >
                <PanelLeftIcon className="size-4" />
              </Button>

              <div className="flex items-center gap-1 md:hidden">
                <ChevronLeft className="size-4 text-muted-foreground" />
                <span className="text-section">
                  {t("navigation:page.settingsTitle")}
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                disabled={!workspace?.id}
                className="hidden md:inline-flex"
                onClick={() => {
                  if (!workspace?.id) return;

                  navigate({
                    to: "/dashboard/workspace/$workspaceId/home",
                    params: { workspaceId: workspace.id },
                  });
                }}
              >
                <ChevronLeft />

                {t("navigation:page.backToWorkspace")}
              </Button>
            </div>

            <h1 className="mt-4 hidden pl-1 text-page md:block">
              {t("navigation:page.settingsTitle")}
            </h1>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsSidebarProvider
              workspaceId={workspace?.id}
              menuOpen={settingsMenuOpen}
              setMenuOpen={setSettingsMenuOpen}
            >
              <Outlet />
            </SettingsSidebarProvider>
          </div>
        </div>
      </div>
    </>
  );
}

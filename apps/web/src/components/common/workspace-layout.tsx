import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NewTaskButton } from "@/components/common/header/new-task-button";
import Layout from "@/components/common/layout";
import { MobileHeaderBell } from "@/components/notification/mobile-header-bell";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { KbdSequence } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { cn } from "@/lib/cn";

type WorkspaceLayoutProps = {
  title: string;
  headerActions?: ReactNode;
  children: ReactNode;
  onCreateProject?: () => void;
  className?: string;
};

export default function WorkspaceLayout({
  title,
  headerActions,
  children,
  className,
}: WorkspaceLayoutProps) {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();

  return (
    <Layout>
      {/* En móvil la cabecera crece en vez de desbordarse (Fase 9): arriba
       * las migas, la tarea nueva y la campana; debajo, si las hay, las
       * acciones de la página, que se desplazan en horizontal. En escritorio
       * todo va en una línea, en el mismo orden que antes. */}
      <Layout.Header className="h-auto min-h-10 md:h-10">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-1.5 gap-y-1.5 md:flex-nowrap">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="-ml-1 h-6 w-6 md:hidden" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="flex items-center gap-2 text-meta">
                    {t("common:a11y.toggleSidebar")}
                    <KbdSequence
                      keys={[
                        shortcuts.sidebar.prefix,
                        shortcuts.sidebar.toggle,
                      ]}
                    />
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="mx-1.5 h-4 w-px shrink-0 bg-border/80 md:hidden" />
            <Breadcrumb className="flex min-w-0 items-center gap-1 text-xs w-full">
              <BreadcrumbList className="flex-nowrap">
                {/* El nombre del espacio sobra en un móvil: ya está en la
                 * barra lateral, y le quita sitio al de la página. */}
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink href="/">
                    <span className="text-xs font-normal text-card-foreground">
                      {workspace?.name}
                    </span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:inline-flex" />
                <BreadcrumbItem className="min-w-0">
                  <span className="truncate text-xs font-normal text-card-foreground">
                    {title}
                  </span>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="order-2 flex shrink-0 items-center gap-1.5">
            {/* Fuera de un proyecto todo es espacio personal o
             * administracion: la tarea nace asignada a quien la crea, o no
             * apareceria en Hoy, el Planificador ni Mis tareas. */}
            <NewTaskButton assignToMe />
            <MobileHeaderBell />
          </div>
          {headerActions && (
            <div
              className={cn(
                "order-3 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto md:w-auto md:overflow-visible",
                className,
              )}
            >
              {headerActions}
            </div>
          )}
        </div>
      </Layout.Header>
      <Layout.Content>{children}</Layout.Content>
    </Layout>
  );
}

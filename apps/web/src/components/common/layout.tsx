import type React from "react";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useUserPreferencesEffects } from "@/hooks/use-user-preferences-effects";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";

type LayoutProps = {
  children: ReactNode;
  className?: string;
};

type HeaderProps = {
  children: ReactNode;
  className?: string;
};

type ContentProps = {
  children: ReactNode;
  className?: string;
};

function LayoutHeader({ children, className }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex h-10 shrink-0 gap-2 transition-[width,height] ease-in-out border-b border-border bg-card p-2",
        className,
      )}
    >
      {children}
    </header>
  );
}

function LayoutContent({ children, className }: ContentProps) {
  return (
    <div className={cn("flex-1 min-h-0", className)}>
      <div className="h-full">{children}</div>
    </div>
  );
}

function Layout({ children, className }: LayoutProps) {
  const { sidebarDefaultOpen, setSidebarDefaultOpen } =
    useUserPreferencesStore();

  useUserPreferencesEffects();

  return (
    <div className="flex w-full bg-background">
      {/* Controlado y persistido: cada ruta monta su propio <Layout>, asi que
          sin esto el estado de la barra volveria al valor por defecto en cada
          cambio de pestana o de proyecto. */}
      <SidebarProvider
        open={sidebarDefaultOpen}
        onOpenChange={setSidebarDefaultOpen}
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 60)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset
          className={cn(
            "m-2 flex min-w-0 flex-1 flex-col overflow-auto overscroll-none rounded-xl border border-border/80 bg-background shadow-sm/5",
            className,
          )}
        >
          {children}
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

Layout.Header = LayoutHeader;
Layout.Content = LayoutContent;

export default Layout;

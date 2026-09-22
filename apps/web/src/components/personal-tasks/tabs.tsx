import { useNavigate } from "@tanstack/react-router";
import { CalendarRange, List, SquareKanban, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { PersonalScope } from "@/fetchers/my-work";
import { cn } from "@/lib/cn";

const TABS = [
  { view: "list", icon: List },
  { view: "board", icon: SquareKanban },
  { view: "gantt", icon: CalendarRange },
  { view: "table", icon: Table2 },
] as const;

export type PersonalTasksView = (typeof TABS)[number]["view"];

// Mismo tinte que la vista activa de un proyecto (`project-layout.tsx`): el
// rail de 2 px en River Teal es el que marca "activo" sin depender solo del
// color (marca.md principio 2).
function tabClass(isActive: boolean) {
  return cn(
    "h-6 gap-1.5 rounded-md px-2 text-xs",
    isActive
      ? "bg-accent text-foreground shadow-[inset_0_-2px_0_var(--brand)] hover:bg-accent"
      : "text-muted-foreground",
  );
}

/**
 * Cabecera compartida de "Mis tareas": el conmutador entre Lista, Tablero,
 * Gantt y Tabla, mas el ambito (asignadas a mi / de mis equipos). Vive en
 * `headerActions` de `WorkspaceLayout` en las cuatro rutas, igual que el
 * selector de vista de un proyecto vive en `ProjectLayout`.
 */
export function PersonalTasksTabs({
  workspaceId,
  active,
  scope,
  onScopeChange,
}: {
  workspaceId: string;
  active: PersonalTasksView;
  scope: PersonalScope;
  onScopeChange: (scope: PersonalScope) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2">
      <SegmentedControl
        label={t("goals:target.scope")}
        value={scope}
        onValueChange={onScopeChange}
        options={[
          { value: "assigned", label: t("goals:scope.assigned") },
          { value: "team", label: t("goals:scope.team") },
        ]}
      />
      <div className="flex items-center gap-0.5 rounded-lg border border-border/80 bg-card p-0.5">
        {TABS.map(({ view, icon: Icon }) => (
          <Button
            key={view}
            variant="ghost"
            size="xs"
            className={tabClass(active === view)}
            onClick={() =>
              navigate({
                to: `/dashboard/workspace/$workspaceId/my-tasks/${view}`,
                params: { workspaceId },
              })
            }
          >
            <Icon className="size-3.5" />
            {t(`myTasks:tabs.${view}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}

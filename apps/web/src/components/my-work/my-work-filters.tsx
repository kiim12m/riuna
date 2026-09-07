import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MyWorkDueWindow } from "@/fetchers/my-work/get-my-work";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { cn } from "@/lib/cn";

const DUE_WINDOWS: MyWorkDueWindow[] = ["all", "overdue", "today", "week"];

/**
 * Tres controles fijos, no el motor de filtros de la Fase 4.
 *
 * El compilador `filter-to-sql` es agnostico del ambito y funcionaria, pero el
 * registro de campos no: una definicion de proyecto **eclipsa** a la del espacio
 * con la misma clave, y puede ser de otro tipo en cada proyecto, asi que
 * `custom.presupuesto` filtraria a cero en silencio en unos proyectos y no en
 * otros. `status` es ademas un slug por proyecto. Hasta que eso tenga respuesta,
 * lo que se ofrece aqui esta servido por indice y no miente.
 */
export function MyWorkFilters({
  workspaceId,
  due,
  includeDone,
  projectId,
  onChange,
}: {
  workspaceId: string;
  due: MyWorkDueWindow;
  includeDone: boolean;
  projectId?: string;
  onChange: (next: {
    due?: MyWorkDueWindow;
    done?: boolean;
    projectId?: string;
  }) => void;
}) {
  const { t } = useTranslation();
  const { data: projects = [] } = useGetProjects({ workspaceId });

  const selectedProject = projects.find((project) => project.id === projectId);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <fieldset
        className="inline-flex min-w-0 items-center rounded-lg border border-border bg-muted/40 p-0.5"
        aria-label={t("myWork:filters.due.label")}
      >
        {DUE_WINDOWS.map((window) => (
          <button
            key={window}
            type="button"
            aria-pressed={due === window}
            onClick={() => onChange({ due: window })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              due === window
                ? "bg-background text-foreground shadow-e1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`myWork:filters.due.${window}`)}
          </button>
        ))}
      </fieldset>

      <Select
        value={projectId ?? "all"}
        onValueChange={(next) =>
          onChange({
            projectId:
              typeof next === "string" && next !== "all" ? next : undefined,
          })
        }
      >
        <SelectTrigger className="h-8 w-48" id="my-work-project">
          <SelectValue>
            {selectedProject?.name ?? t("myWork:filters.project.all")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("myWork:filters.project.all")}</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Checkbox
          id="my-work-show-done"
          checked={includeDone}
          onCheckedChange={(checked) => onChange({ done: checked === true })}
        />
        <Label
          htmlFor="my-work-show-done"
          className="cursor-pointer text-muted-foreground text-xs"
        >
          {t("myWork:filters.showDone")}
        </Label>
      </div>
    </div>
  );
}

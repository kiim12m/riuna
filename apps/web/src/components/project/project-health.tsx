import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUpdateProjectStatus } from "@/hooks/mutations/project/use-update-project-status";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  HEALTH_DOT,
  isProjectHealth,
  PROJECT_HEALTHS,
  type ProjectHealth,
} from "@/lib/project-health";
import { toast } from "@/lib/toast";

export function HealthDot({
  health,
  className,
}: {
  health: ProjectHealth;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        HEALTH_DOT[health],
        className,
      )}
    />
  );
}

type ProjectHealthFields = {
  id: string;
  name: string;
  health?: string | null;
  healthNote?: string | null;
};

/**
 * El estado de salud de un proyecto (ADR 087) como chip: en la lista de
 * proyectos y en la cabecera. Quien puede configurar el proyecto lo cambia
 * desde ahi; el resto lee la nota.
 */
export function ProjectHealthChip({
  project,
  workspaceId,
  canEdit,
  className,
}: {
  project: ProjectHealthFields;
  workspaceId: string;
  canEdit: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const health = isProjectHealth(project.health)
    ? project.health
    : "not_started";
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectHealth>(health);
  const [note, setNote] = useState(project.healthNote ?? "");
  const [notify, setNotify] = useState(false);
  const notifyId = useId();
  const { mutate, isPending } = useUpdateProjectStatus(workspaceId);

  // Cada vez que se abre, desde lo guardado: si otro lo cambio mientras, se
  // parte de lo suyo.
  useEffect(() => {
    if (!open) return;
    setSelected(health);
    setNote(project.healthNote ?? "");
    setNotify(false);
  }, [open, health, project.healthNote]);

  const save = () => {
    mutate(
      {
        projectId: project.id,
        input: { health: selected, note: note.trim() || null, notify },
      },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success(t("workspace:projects.health.saved"));
        },
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t("workspace:projects.health.error"),
          ),
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="project-health"
          title={project.healthNote || undefined}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border/80 px-2 text-xs hover:bg-accent",
            className,
          )}
        >
          <HealthDot health={health} />
          {t(`workspace:projects.health.${health}`)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2"
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="px-1 pb-1.5 font-medium text-sm">
          {t("workspace:projects.health.titleFor", { name: project.name })}
        </p>
        {canEdit ? (
          <div className="space-y-2">
            <div className="flex flex-col">
              {PROJECT_HEALTHS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected === option}
                  onClick={() => setSelected(option)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                    selected === option && "bg-accent",
                  )}
                >
                  <HealthDot health={option} />
                  {t(`workspace:projects.health.${option}`)}
                </button>
              ))}
            </div>
            <Textarea
              value={note}
              maxLength={500}
              rows={2}
              placeholder={t("workspace:projects.health.notePlaceholder")}
              aria-label={t("workspace:projects.health.note")}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex items-center gap-2 px-1 text-xs">
              <Checkbox
                id={notifyId}
                checked={notify}
                onCheckedChange={(checked) => setNotify(checked === true)}
              />
              <label htmlFor={notifyId}>
                {t("workspace:projects.health.notify")}
              </label>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={isPending}
              onClick={save}
            >
              {t("workspace:projects.health.save")}
            </Button>
          </div>
        ) : (
          <p className="px-1 text-muted-foreground text-sm">
            {project.healthNote || t("workspace:projects.health.noNote")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** «Las tareas acaban el 13 nov, 3 días laborables después del fin». */
export function ProjectScheduleWarning({
  schedule,
}: {
  schedule?: { tasksDueDate: string; overflowWorkDays: number } | null;
}) {
  const { t } = useTranslation();
  if (!schedule) return null;
  const text = t("workspace:projects.overflow", {
    date: formatDate(schedule.tasksDueDate, { day: "numeric", month: "short" }),
    count: schedule.overflowWorkDays,
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={text}
            data-testid="project-overflow"
            className="inline-flex text-destructive-foreground"
          >
            <AlertTriangle className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

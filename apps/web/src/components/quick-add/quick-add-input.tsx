import {
  CalendarClock,
  CircleHelp,
  Flag,
  FolderKanban,
  Inbox,
  Plus,
  Tag,
  Timer,
} from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { useCaptureTask } from "@/hooks/mutations/capture/use-capture-task";
import useGetLabelsByWorkspace from "@/hooks/queries/label/use-get-labels-by-workspace";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { cn } from "@/lib/cn";
import { parseDayKey } from "@/lib/day-key";
import { formatDuration } from "@/lib/duration";
import { formatDate } from "@/lib/format";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import { parseQuickAdd } from "@/lib/quick-add/parse";
import { toast } from "@/lib/toast";

type QuickAddInputProps = {
  workspaceId: string;
  /** El dia del plan si no se escribe ninguno: en Hoy, hoy. */
  defaultPlannedDate?: string;
  autoFocus?: boolean;
  /** El «?» con la chuleta de la sintaxis junto a la caja; sobra en una
   * columna estrecha. */
  showHint?: boolean;
  onCaptured?: () => void;
  className?: string;
};

/**
 * La chuleta de la sintaxis, detras de un «?»: se abre al pasar el raton o al
 * pulsarlo -en una pantalla tactil no hay raton-. Antes iba siempre a la
 * vista bajo la caja.
 */
function SyntaxHelp() {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        openOnHover
        delay={150}
        aria-label={t("quickAdd:help")}
        className="inline-flex size-8 shrink-0 cursor-help items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <CircleHelp className="size-4" />
      </PopoverTrigger>
      <PopoverPopup tooltipStyle side="bottom" align="end" className="max-w-72">
        <p
          className="whitespace-pre-line px-1 py-1 leading-relaxed"
          data-testid="quick-add-help"
        >
          {t("quickAdd:hint")}
        </p>
      </PopoverPopup>
    </Popover>
  );
}

function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <li>
      <Badge variant="outline" size="sm" className="gap-1 font-normal">
        {icon}
        {children}
      </Badge>
    </li>
  );
}

function minuteLabel(minute: number) {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  return `${hours}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * Captura rapida (ADR 052): una linea que se convierte en tarea al pulsar
 * Intro, con una vista previa de lo que el parser ha entendido debajo. Lo que
 * no entiende se queda en el titulo, asi que la vista previa es la unica
 * forma de saber si `@vie` ha sido un dia o texto.
 */
export function QuickAddInput({
  workspaceId,
  defaultPlannedDate,
  autoFocus,
  showHint = true,
  onCaptured,
  className,
}: QuickAddInputProps) {
  const { t, i18n } = useTranslation();
  const inputId = useId();
  const [text, setText] = useState("");
  const { data: workspaceLabels = [] } = useGetLabelsByWorkspace(workspaceId);
  const { data: projects = [] } = useGetProjects({ workspaceId });
  const { mutate: capture, isPending } = useCaptureTask();

  // Solo las del espacio: las filas con `taskId` son copias colgadas de una
  // tarea, y la API rechaza capturar con ellas.
  const labels = useMemo(
    () =>
      workspaceLabels
        .filter((label) => label.taskId === null)
        .map((label) => ({ id: label.id, name: label.name })),
    [workspaceLabels],
  );
  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
      })),
    [projects],
  );
  const parsed = useMemo(
    () =>
      parseQuickAdd(text, {
        today: new Date(),
        labels,
        projects: projectOptions,
      }),
    [text, labels, projectOptions],
  );

  const plannedDate = parsed.plannedDate ?? defaultPlannedDate ?? null;
  const startMinute = parsed.plannedDate ? parsed.startMinute : null;

  function dayLabel(key: string) {
    return formatDate(parseDayKey(key), {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function submit() {
    if (!parsed.title || isPending) return;

    capture(
      {
        workspaceId,
        title: parsed.title,
        projectId: parsed.project?.id,
        priority: parsed.priority ?? undefined,
        estimate: parsed.estimate ?? undefined,
        dueDate: parsed.dueDate ?? undefined,
        plannedDate: plannedDate ?? undefined,
        startMinute: startMinute ?? undefined,
        labelIds: parsed.labels.map((label) => label.id),
      },
      {
        onSuccess: (captured) => {
          setText("");
          toast.success(
            t(
              captured.inInbox
                ? "quickAdd:capturedInInbox"
                : "quickAdd:captured",
              {
                key: `${captured.projectSlug}-${captured.task.number}`,
              },
            ),
          );
          onCaptured?.();
        },
        onError: () => toast.error(t("quickAdd:error")),
      },
    );
  }

  const hasText = text.trim() !== "";

  return (
    <form
      className={cn("space-y-1.5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {/* Relleno y sin borde: con el borde y el fondo de una tarjeta, en la
          columna «Sin planificar» parecia una tarea mas. El borde vuelve al
          escribir. */}
      <div className="flex items-center gap-1">
        <label
          htmlFor={inputId}
          className="flex min-w-0 flex-1 cursor-text items-center gap-2 rounded-md border border-transparent bg-muted/60 px-2 transition-colors hover:bg-muted focus-within:border-input focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/40"
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">{t("quickAdd:label")}</span>
          <input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("quickAdd:placeholder")}
            // biome-ignore lint/a11y/noAutofocus: se abre a peticion, con `q`.
            autoFocus={autoFocus}
            autoComplete="off"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            data-testid="quick-add-input"
          />
        </label>
        {/* Fuera de la etiqueta: un boton dentro de un `label` es HTML invalido. */}
        {showHint && <SyntaxHelp />}
      </div>

      {hasText ? (
        <ul
          aria-label={t("quickAdd:preview")}
          className="flex flex-wrap gap-1"
          data-testid="quick-add-preview"
        >
          <Chip
            icon={
              parsed.project ? (
                <FolderKanban className="size-3" />
              ) : (
                <Inbox className="size-3" />
              )
            }
          >
            {parsed.project?.name ?? t("navigation:sidebar.inbox")}
          </Chip>
          {plannedDate && (
            <Chip icon={<CalendarClock className="size-3" />}>
              {dayLabel(plannedDate)}
              {startMinute !== null && ` · ${minuteLabel(startMinute)}`}
            </Chip>
          )}
          {parsed.dueDate && (
            <Chip icon={<Flag className="size-3" />}>
              {t("quickAdd:due", { day: dayLabel(parsed.dueDate) })}
            </Chip>
          )}
          {parsed.estimate !== null && (
            <Chip icon={<Timer className="size-3" />}>
              {formatDuration(parsed.estimate, i18n.language)}
            </Chip>
          )}
          {parsed.priority && (
            <Chip icon={getPriorityIcon(parsed.priority)}>
              {getPriorityLabel(parsed.priority)}
            </Chip>
          )}
          {parsed.labels.map((label) => (
            <Chip key={label.id} icon={<Tag className="size-3" />}>
              {label.name}
            </Chip>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

import { CalendarDays, Clock, Layout, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import projectIcons from "@/constants/project-icons";
import { usePlanAtSlot } from "@/hooks/mutations/schedule/use-plan-at-slot";
import { usePlanner } from "@/hooks/queries/planner/use-planner";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { cn } from "@/lib/cn";
import { formatClock } from "./schedule-timeline";

const LAST_PROJECT_KEY = "riuna:schedule:lastProjectId";

function readLastProjectId(): string | null {
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

function writeLastProjectId(projectId: string) {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, projectId);
  } catch {
    // Almacenamiento bloqueado (navegacion privada, cuota): no es motivo
    // para impedir crear la tarea, solo se pierde el recuerdo del proyecto.
  }
}

type CreateTaskPlaceholderProps = {
  workspaceId: string;
  /** `yyyy-mm-dd`: el dia sobre el que se va a planificar. */
  plannedDate: string;
  /** Minuto de anclaje inicial. `null` en la variante "day" (sin eje horario). */
  startMinute: number | null;
  /** "time": tiene pestana de hora y se puede alternar a "para el dia"
   * (como `isForDayMode` en super-productivity). "day": siempre planea sin
   * hora, sin pestana -- la variante que usa la vista Mes. */
  variant: "time" | "day";
  isEditing: boolean;
  onEditEnd: () => void;
  /** Solo variante "time": posiciona la caja sobre la rejilla horaria. */
  style?: React.CSSProperties;
  className?: string;
};

/**
 * Puerto de `create-task-placeholder` de super-productivity (MIT, ver
 * `NOTICE`): en reposo, una caja discontinua con un mensaje de "pulsa aqui
 * para crear una tarea"; en edicion, un campo que crea una tarea nueva o
 * planifica una de mis tareas sin planificar (ADR 041).
 */
export function CreateTaskPlaceholder({
  workspaceId,
  plannedDate,
  startMinute,
  variant,
  isEditing,
  onEditEnd,
  style,
  className,
}: CreateTaskPlaceholderProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [forDayOnly, setForDayOnly] = useState(variant === "day");
  const [title, setTitle] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [projectId, setProjectId] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useGetProjects({ workspaceId });
  const { data: plan } = usePlanner(workspaceId);
  const planAtSlot = usePlanAtSlot(workspaceId);

  useEffect(() => {
    if (!isEditing) return;
    setForDayOnly(variant === "day");
    setTitle("");
    setHighlighted(0);
    inputRef.current?.focus();
  }, [isEditing, variant]);

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      const last = readLastProjectId();
      setProjectId(
        last && projects.some((project) => project.id === last)
          ? last
          : (projects[0]?.id ?? ""),
      );
    }
  }, [projects, projectId]);

  const matches = useMemo(() => {
    const query = title.trim().toLowerCase();
    if (!query) return [];
    return (plan?.unplanned ?? [])
      .filter((task) => task.title.toLowerCase().includes(query))
      .slice(0, 6);
  }, [title, plan]);

  useEffect(() => {
    if (highlighted >= matches.length) setHighlighted(0);
  }, [matches.length, highlighted]);

  useEffect(() => {
    if (!isEditing) return;
    function onDocumentPointerDown(event: PointerEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        onEditEnd();
      }
    }
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () =>
      document.removeEventListener("pointerdown", onDocumentPointerDown);
  }, [isEditing, onEditEnd]);

  if (!isEditing) {
    // Puramente visual: como en super-productivity, no captura el puntero
    // -el clic que abre la edicion lo maneja el fondo de la rejilla, no esta
    // caja.
    return (
      <div
        data-testid="schedule-create-placeholder"
        className={cn(
          "pointer-events-none absolute inset-x-1 rounded-lg border-2 border-brand/70 border-dashed bg-card/60",
          className,
        )}
        style={style}
        aria-hidden="true"
      >
        {variant === "time" && (
          // `bottom-full` ya deja el borde inferior justo en el borde
          // superior del quadre -sin `-translate-y-full` (que lo desplazaba
          // una segunda vez y separaba la pestanya del quadre). `translate-y-px`
          // solapa los dos bordes discontinuos de 2px para que se vean como
          // una sola pieza, no dos lineas pegadas.
          <div className="-translate-x-1/2 absolute bottom-full left-1/2 flex translate-y-px items-center gap-1 whitespace-nowrap rounded-t-md border-2 border-brand/70 border-b-0 border-dashed bg-card px-2 py-0.5 font-semibold text-brand text-meta">
            <Clock className="size-3" />
            {formatClock(startMinute ?? 0)}
          </div>
        )}
        <div className="flex h-full items-center justify-center gap-1 px-2 text-brand text-meta">
          <Plus className="size-3.5 shrink-0" />
          <span className="line-clamp-2 text-center leading-tight">
            {t("schedule:placeholder.clickToCreate")}
          </span>
        </div>
      </div>
    );
  }

  const submitExisting = (taskId: string, taskProjectId: string) => {
    planAtSlot.mutate(
      {
        kind: "existing",
        taskId,
        projectId: taskProjectId,
        plannedDate,
        startMinute: forDayOnly ? null : startMinute,
      },
      { onSuccess: onEditEnd },
    );
  };

  const submitNew = () => {
    const trimmed = title.trim();
    if (!trimmed || !projectId || !user?.id) return;
    writeLastProjectId(projectId);
    planAtSlot.mutate(
      {
        kind: "new",
        title: trimmed,
        projectId,
        plannedDate,
        startMinute: forDayOnly ? null : startMinute,
        userId: user.id,
      },
      { onSuccess: onEditEnd },
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEditEnd();
      return;
    }
    if (event.key === "1" && event.ctrlKey && variant === "time") {
      event.preventDefault();
      setForDayOnly((current) => !current);
      return;
    }
    if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % matches.length);
      return;
    }
    if (event.key === "ArrowUp" && matches.length > 0) {
      event.preventDefault();
      setHighlighted(
        (current) => (current - 1 + matches.length) % matches.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = matches[highlighted];
      if (picked) {
        submitExisting(picked.id, picked.projectId);
      } else {
        submitNew();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-x-1 z-30 flex flex-col gap-1 rounded-lg border-2 border-brand bg-card p-1.5 shadow-lg",
        className,
      )}
      style={style}
    >
      {variant === "time" && (
        <button
          type="button"
          onClick={() => setForDayOnly((current) => !current)}
          className="flex w-fit items-center gap-1 rounded px-1 text-meta text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {forDayOnly ? (
            <CalendarDays className="size-3" />
          ) : (
            <Clock className="size-3" />
          )}
          {forDayOnly
            ? t("schedule:placeholder.forDay")
            : formatClock(startMinute ?? 0)}
        </button>
      )}

      <input
        ref={inputRef}
        data-testid="schedule-slot-input"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t(
          forDayOnly
            ? "schedule:placeholder.dayPlaceholder"
            : "schedule:placeholder.inputPlaceholder",
        )}
        className="w-full rounded border border-border/70 bg-background px-1.5 py-1 text-meta outline-none focus-visible:border-brand"
      />

      {matches.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded border border-border/60">
          {matches.map((task, index) => {
            const ProjectIcon =
              projectIcons[task.projectIcon as keyof typeof projectIcons] ??
              Layout;
            return (
              <button
                key={task.id}
                type="button"
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => submitExisting(task.id, task.projectId)}
                className={cn(
                  "flex items-center gap-1 truncate px-1.5 py-1 text-left text-meta",
                  index === highlighted
                    ? "bg-brand/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <ProjectIcon className="size-3 shrink-0" />
                <span className="truncate">{task.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {title.trim() && matches.length === 0 && projects && (
        <Select
          value={projectId}
          onValueChange={(value) => setProjectId(value ?? "")}
        >
          <SelectTrigger id="schedule-slot-project" size="sm">
            <SelectValue>
              {projects.find((project) => project.id === projectId)?.name ??
                t("schedule:placeholder.project")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <p className="truncate text-meta text-muted-foreground/80">
        {matches.length > 0
          ? t("schedule:placeholder.existing")
          : title.trim()
            ? t("schedule:placeholder.createNew", { title: title.trim() })
            : variant === "time"
              ? t(
                  forDayOnly
                    ? "schedule:placeholder.toggleTimeHint"
                    : "schedule:placeholder.toggleDayHint",
                )
              : ""}
      </p>
    </div>
  );
}

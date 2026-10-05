import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useCreateTask from "@/hooks/mutations/task/use-create-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import useProjectStore from "@/store/project";
import type { ProjectWithTasks } from "@/types/project";

type ColumnComposerProps = {
  column: ProjectWithTasks["columns"][number];
};

/**
 * Crear una tarea sin salir de la columna: un titulo y Intro. El «+» de la
 * cabecera sigue abriendo el formulario completo para cuando hace falta mas que
 * un titulo; esto es para vaciar la cabeza, varias seguidas.
 *
 * Se queda abierto tras crear, con el campo vacio y el foco dentro: quien captura
 * una lista no quiere pulsar «Añadir» entre una linea y la siguiente.
 */
export function ColumnComposer({ column }: ColumnComposerProps) {
  const { t } = useTranslation();
  const { project } = useProjectStore();
  const { canCreateTasks } = useWorkspacePermission();
  const { mutateAsync: createTask, isPending } = useCreateTask();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!canCreateTasks() || !project?.id) return null;

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || isPending) return;

    try {
      await createTask({
        title: trimmed,
        description: "",
        projectId: project.id,
        status: column.id,
        priority: "no-priority",
      });
      setTitle("");
      inputRef.current?.focus();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:composer.error"),
      );
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <Plus className="size-3.5" />
        {t("tasks:composer.add")}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        // biome-ignore lint/a11y/noAutofocus: el campo aparece al pulsar «Añadir tarea»
        autoFocus
        value={title}
        // `readOnly` y no `disabled`: un campo desactivado pierde el foco, y la
        // siguiente linea tiene que poder escribirse sin tocar el raton.
        readOnly={isPending}
        aria-busy={isPending}
        placeholder={t("tasks:composer.placeholder")}
        aria-label={t("tasks:composer.placeholder")}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!title.trim()) setOpen(false);
        }}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring read-only:opacity-60"
      />
      <p className="px-1 text-label text-muted-foreground">
        {t("tasks:composer.hint")}
      </p>
    </div>
  );
}

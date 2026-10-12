import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Form, FormField } from "@/components/ui/form";
import { useUpdateTaskTitle } from "@/hooks/mutations/task/use-update-task-title";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import debounce from "@/lib/debounce";

type TaskTitleProps = {
  taskId: string;
};

export default function TaskTitle({ taskId }: TaskTitleProps) {
  const { t } = useTranslation();
  const tituloId = useId();
  const { data: task } = useGetTask(taskId);
  const { mutateAsync: updateTaskTitle } = useUpdateTaskTitle();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const isInitializedRef = useRef(false);
  const taskRef = useRef(task);
  const updateTaskRef = useRef(updateTaskTitle);

  useEffect(() => {
    taskRef.current = task;
    updateTaskRef.current = updateTaskTitle;
  }, [task, updateTaskTitle]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: taskId is not needed here
  useEffect(() => {
    isInitializedRef.current = false;
  }, [taskId]);

  const form = useForm<{
    title: string;
  }>({
    values: {
      title: task?.title || "",
    },
  });

  useEffect(() => {
    if (task?.title !== undefined) isInitializedRef.current = true;
  }, [task?.title]);

  const debouncedUpdate = useCallback(
    debounce(async (title: string) => {
      if (!isInitializedRef.current) return;

      const currentTask = taskRef.current;
      const updateTaskFn = updateTaskRef.current;

      if (!currentTask || !updateTaskFn) return;

      try {
        await updateTaskFn({
          ...currentTask,
          title,
        });
      } catch (error) {
        console.error("Failed to update title:", error);
      }
    }, 800),
    [],
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      if (!isInitializedRef.current) return;

      debouncedUpdate(value);
    },
    [debouncedUpdate],
  );

  // Un `textarea` que crece con el texto, y no un `input`: en un movil un
  // titulo de una sola linea se cortaba en la tercera palabra (Fase 9). Se
  // ajusta en JS porque `field-sizing: content` no existe en Safari de iOS.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const title = form.watch("title");
  const fitHeight = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: el alto depende del texto
  useLayoutEffect(fitHeight, [fitHeight, title]);
  useEffect(() => {
    window.addEventListener("resize", fitHeight);
    return () => window.removeEventListener("resize", fitHeight);
  }, [fitHeight]);

  return (
    <Form {...form}>
      {/* El titulo de la tarea es un campo editable, asi que la pagina se
          quedaba sin encabezado de primer nivel que la nombrara: un lector de
          pantalla no tenia por donde entrar. Este `h1` lo da sin cambiar nada de
          lo que se ve, y el campo lo referencia como etiqueta. */}
      <h1 id={tituloId} className="sr-only">
        {form.getValues("title") || t("tasks:detail.titlePlaceholder")}
      </h1>
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <textarea
            {...field}
            ref={(element) => {
              field.ref(element);
              textareaRef.current = element;
            }}
            rows={1}
            aria-labelledby={tituloId}
            placeholder={t("tasks:detail.titlePlaceholder")}
            readOnly={!canEdit}
            className="block h-auto w-full resize-none appearance-none overflow-hidden border-0 bg-transparent p-0 font-heading text-display leading-[1.15] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-foreground/45"
            // Un titulo no lleva saltos de linea: Intro termina, como en el
            // `input` de antes, y un salto pegado pasa a espacio.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onChange={(e) => {
              const value = e.target.value.replace(/\s*\n\s*/g, " ");
              field.onChange(value);
              handleTitleChange(value);
            }}
          />
        )}
      />
    </Form>
  );
}

import { useCallback, useLayoutEffect, useRef } from "react";
import { useLinkCommands } from "@/components/editor/link-picker";
import RichMarkdownEditor from "@/components/editor/rich-markdown-editor";
import { useUpdateTaskDescription } from "@/hooks/mutations/task/use-update-task-description";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { uploadTaskImage } from "@/lib/upload-task-image";

type TaskDescriptionProps = {
  taskId: string;
  /** Con el espacio, `/tarea` y `/página` enlazan tareas y la wiki (ADR 092). */
  workspaceId?: string;
};

/**
 * La descripcion de una tarea: el editor de siempre, que guarda solo al
 * escribir y sube los ficheros a la tarea. Quien no puede editar tareas la ve
 * en solo lectura.
 */
export default function TaskDescription({
  taskId,
  workspaceId,
}: TaskDescriptionProps) {
  const { data: task } = useGetTask(taskId);
  const { mutateAsync: updateTaskDescription } = useUpdateTaskDescription();
  const { canUpdateTasks } = useWorkspacePermission();
  const taskRef = useRef(task);

  useLayoutEffect(() => {
    taskRef.current = task;
  }, [task]);

  // Va a la tarea que se estaba editando al teclear (la de este render), con
  // los datos mas nuevos que haya de ella.
  const save = useCallback(
    async (markdown: string) => {
      if (!task) return;
      const latest = taskRef.current;
      const base = latest?.id === task.id ? latest : task;

      try {
        await updateTaskDescription({ ...base, description: markdown });
      } catch (error) {
        console.error("Failed to update description:", error);
      }
    },
    [task, updateTaskDescription],
  );

  const upload = useCallback(
    (file: File) => uploadTaskImage({ taskId, surface: "description", file }),
    [taskId],
  );

  const { commands, picker } = useLinkCommands({
    workspaceId: workspaceId ?? "",
    kinds: LINK_KINDS,
  });

  return (
    <>
      <RichMarkdownEditor
        documentKey={taskId}
        markdown={task?.description}
        onChange={save}
        upload={upload}
        canEdit={canUpdateTasks()}
        extraSlashCommands={workspaceId ? commands : undefined}
      />
      {workspaceId && picker}
    </>
  );
}

const LINK_KINDS: Array<"page" | "task"> = ["page", "task"];

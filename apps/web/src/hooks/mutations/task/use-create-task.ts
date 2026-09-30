import { useMutation, useQueryClient } from "@tanstack/react-query";
import createTask, {
  type CreateTaskRequest,
} from "@/fetchers/task/create-task";

function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      title,
      description,
      userId,
      projectId,
      status,
      startDate,
      dueDate,
      priority,
      parentId,
      estimate,
    }: CreateTaskRequest) =>
      createTask(
        title,
        description,
        projectId,
        userId,
        status,
        startDate ? new Date(startDate) : undefined,
        dueDate ? new Date(dueDate) : undefined,
        priority,
        { parentId, estimate: estimate ?? undefined },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      // Hoy, el Planificador y Mis tareas no leen de ["tasks", projectId]:
      // la tarea que se crea asignada desde la cabecera ("Nueva tarea") tiene
      // que salir en "Sin planificar" sin recargar. Solo se recargan si estan
      // en pantalla.
      for (const key of ["my-work", "planner", "today"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      // El padre cambia: gana una hija y con ella su progreso y sus fechas.
      if (variables.parentId) {
        void queryClient.invalidateQueries({
          queryKey: ["task", variables.parentId],
        });
      }
    },
  });
}

export default useCreateTask;

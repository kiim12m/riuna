import { useMutation, useQueryClient } from "@tanstack/react-query";
import createTaskRelation from "@/fetchers/task-relation/create-task-relation";

function useCreateTaskRelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaskRelation,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.sourceTaskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.targetTaskId],
      });
      // Una precedencia mueve fechas (ADR 084): la sucesora y lo que arrastre.
      if (variables.relationType === "precedes") {
        queryClient.invalidateQueries({ queryKey: ["task"] });
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        queryClient.invalidateQueries({
          queryKey: ["task-relations", "project"],
        });
      }
    },
  });
}

export default useCreateTaskRelation;

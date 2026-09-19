import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Cadence,
  createRecurrence,
  deleteRecurrence,
  getRecurrences,
  type RecurrenceTemplate,
  updateRecurrence,
} from "@/fetchers/recurrence";

export function useGetRecurrences(projectId: string) {
  return useQuery({
    queryKey: ["recurrences", projectId],
    queryFn: () => getRecurrences(projectId),
    enabled: Boolean(projectId),
  });
}

function useRecurrenceInvalidation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["recurrences", projectId] });
  };
}

export function useCreateRecurrence(projectId: string) {
  const invalidate = useRecurrenceInvalidation(projectId);

  return useMutation({
    mutationFn: (payload: {
      template: RecurrenceTemplate;
      cadence: Cadence;
      startsAt: string;
      endsAt?: string | null;
    }) => createRecurrence(projectId, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateRecurrence(projectId: string) {
  const invalidate = useRecurrenceInvalidation(projectId);

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; active?: boolean }) =>
      updateRecurrence(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteRecurrence(projectId: string) {
  const invalidate = useRecurrenceInvalidation(projectId);

  return useMutation({
    mutationFn: (id: string) => deleteRecurrence(id),
    onSuccess: invalidate,
  });
}

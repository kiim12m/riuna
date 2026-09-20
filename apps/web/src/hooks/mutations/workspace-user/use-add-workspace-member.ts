import { useMutation } from "@tanstack/react-query";
import addWorkspaceMember, {
  type AddWorkspaceMemberRequest,
} from "@/fetchers/workspace/add-workspace-member";
import queryClient from "@/query-client";

function useAddWorkspaceMember() {
  return useMutation({
    mutationFn: async (request: AddWorkspaceMemberRequest) =>
      await addWorkspaceMember(request),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace", "full", workspaceId],
      });

      queryClient.invalidateQueries({
        queryKey: ["workspace-users", workspaceId],
      });
    },
  });
}

export default useAddWorkspaceMember;

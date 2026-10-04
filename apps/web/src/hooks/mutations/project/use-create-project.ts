import { useMutation } from "@tanstack/react-query";
import createProject from "@/fetchers/project/create-project";

function useCreateProject({
  name,
  slug,
  workspaceId,
  icon,
  templateId,
}: {
  name: string;
  slug: string;
  workspaceId: string;
  icon: string;
  templateId?: string;
}) {
  return useMutation({
    mutationFn: () =>
      createProject({ name, slug, workspaceId, icon, templateId }),
  });
}

export default useCreateProject;

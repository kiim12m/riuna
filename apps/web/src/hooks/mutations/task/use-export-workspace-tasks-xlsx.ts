import { useMutation } from "@tanstack/react-query";
import exportWorkspaceTasksXlsx from "@/fetchers/task/export-workspace-tasks-xlsx";

const useExportWorkspaceTasksXlsx = () => {
  return useMutation({
    mutationFn: (workspaceId: string) => exportWorkspaceTasksXlsx(workspaceId),
  });
};

export default useExportWorkspaceTasksXlsx;

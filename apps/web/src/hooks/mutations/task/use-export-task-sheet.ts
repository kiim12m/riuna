import { useMutation } from "@tanstack/react-query";
import exportTaskSheet from "@/fetchers/task/export-task-sheet";

const useExportTaskSheet = () => {
  return useMutation({
    mutationFn: (input: Parameters<typeof exportTaskSheet>[0]) =>
      exportTaskSheet(input),
  });
};

export default useExportTaskSheet;

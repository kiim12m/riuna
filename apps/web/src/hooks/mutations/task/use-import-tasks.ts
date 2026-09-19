import { useMutation } from "@tanstack/react-query";
import importTasks, {
  type ImportColumnMapping,
} from "@/fetchers/task/import-tasks";

export type { ImportColumnMapping };

const useImportTasks = () => {
  return useMutation({
    mutationFn: (input: Parameters<typeof importTasks>[0]) =>
      importTasks(input),
  });
};

export default useImportTasks;

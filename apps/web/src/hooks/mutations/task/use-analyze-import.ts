import { useMutation } from "@tanstack/react-query";
import analyzeImport from "@/fetchers/task/analyze-import";

const useAnalyzeImport = () => {
  return useMutation({
    mutationFn: ({
      projectId,
      file,
      source,
    }: {
      projectId: string;
      file: File;
      source?: string;
    }) => analyzeImport(projectId, file, source),
  });
};

export default useAnalyzeImport;

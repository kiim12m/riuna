import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProjectTreeSettings from "@/fetchers/project/update-project-tree-settings";

export function useUpdateProjectTreeSettings(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Parameters<typeof updateProjectTreeSettings>[1]) =>
      updateProjectTreeSettings(projectId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      // Los ajustes del arbol viajan dentro de la respuesta de tareas
      // (`getTasks` los devuelve junto al proyecto), y esa es la consulta que
      // lee la pantalla que los pinta. Sin esta clave el interruptor se
      // apagaba solo delante de quien acababa de encenderlo, porque seguia
      // leyendo la respuesta cacheada hasta el refresco de los 30 s.
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });
}

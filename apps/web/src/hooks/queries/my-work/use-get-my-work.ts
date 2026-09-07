import { useQuery } from "@tanstack/react-query";
import getMyWork, { type MyWorkParams } from "@/fetchers/my-work/get-my-work";

/**
 * La clave tiene que ser un **prefijo** de verdad: el WebSocket invalida por
 * `["my-work"]` a secas, asi que meter los parametros dentro de una cadena
 * unica dejaria la invalidacion sin casar nada.
 */
export function myWorkQueryKey(params: MyWorkParams) {
  return [
    "my-work",
    params.workspaceId,
    params.scope,
    {
      includeDone: params.includeDone ?? false,
      due: params.due ?? "all",
      projectId: params.projectId ?? null,
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    },
  ] as const;
}

export function useGetMyWork(params: MyWorkParams, enabled = true) {
  return useQuery({
    queryKey: myWorkQueryKey(params),
    queryFn: () => getMyWork(params),
    // La membresia llega empujada por el canal de usuario; el contenido
    // —prioridad, fecha, titulo— no se empuja a proposito, y este intervalo es
    // la red que lo recoge. `useGetTasks` ya usa 30 s; aqui basta con menos
    // frecuencia porque la pagina no es la de trabajo minuto a minuto.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    enabled: enabled && Boolean(params.workspaceId),
  });
}

import { useQuery } from "@tanstack/react-query";
import getNotifications from "@/fetchers/notification/get-notifications";

function useGetNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    // `getNotifications` recibe una pagina: sin envolverla, TanStack le pasaria
    // su contexto de consulta como si fuera una.
    queryFn: () => getNotifications(),
  });
}

export default useGetNotifications;

import { useQuery } from "@tanstack/react-query";
import { getUnreadNotificationCount } from "@/fetchers/notification/get-notifications";

/**
 * Cuantas no leidas tiene en total. Cuelga de `["notifications"]` para que lo
 * invalide todo lo que ya invalida la lista (marcar leida, borrar, un aviso
 * nuevo por WebSocket) sin tocar nada mas.
 */
export default function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadNotificationCount,
  });
}

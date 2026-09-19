import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type InstanceUser = {
  id: string;
  banned?: boolean | null;
  username?: string | null;
  isLocalAccount?: boolean | null;
};

/**
 * La lista de miembros del espacio la sirve el plugin de organizacion, y de
 * cada persona solo devuelve id, nombre, correo e imagen. Para saber quien
 * esta bloqueado hay que preguntarle al plugin de administracion, que solo
 * responde al admin de instancia: de ahi que la consulta este apagada para
 * todos los demas.
 */
function useGetInstanceUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["instance-users"],
    enabled,
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers({
        query: { limit: 500 },
      });

      if (error) {
        throw new Error(error.message || "Failed to list instance users");
      }

      const users = (data?.users ?? []) as InstanceUser[];
      return new Map(users.map((user) => [user.id, user]));
    },
  });
}

export default useGetInstanceUsers;

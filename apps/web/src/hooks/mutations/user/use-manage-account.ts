import { client } from "@riuna/libs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type ManageAccountInput = {
  userId: string;
  workspaceId: string;
  /** Nombre visible. Se envia solo si cambia. */
  name?: string;
  /** Correo real para una cuenta local. Al asignarlo deja de ser local. */
  email?: string;
  /** Contrasena nueva. Vacio significa dejarla como esta. */
  password?: string;
  /** Estado de bloqueo, solo si cambia respecto al actual. */
  banned?: boolean;
};

async function setEmail(userId: string, email: string) {
  const response = await client.user[":id"].email.$put({
    param: { id: userId },
    json: { email },
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      message = (JSON.parse(body) as { message?: string }).message ?? body;
    } catch {
      // El cuerpo no era JSON; se usa el texto tal cual.
    }
    throw new Error(message);
  }

  return response.json();
}

/**
 * Todo lo que el admin de instancia puede hacerle a una cuenta ajena, en una
 * sola llamada. Cada trozo va por su via: nombre, contrasena y bloqueo los
 * sirve el plugin de administracion de Better Auth; el correo es nuestro,
 * porque ademas convierte la cuenta local en normal.
 */
export function useManageAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      name,
      email,
      password,
      banned,
    }: ManageAccountInput) => {
      if (name !== undefined) {
        const { error } = await authClient.admin.updateUser({
          userId,
          data: { name },
        });
        if (error) throw new Error(error.message || "Failed to update profile");
      }

      if (email) {
        await setEmail(userId, email);
      }

      if (password) {
        const { error } = await authClient.admin.setUserPassword({
          userId,
          newPassword: password,
        });
        if (error) throw new Error(error.message || "Failed to set password");
      }

      if (banned !== undefined) {
        // Bloquear cierra ademas las sesiones abiertas, que es justo lo que se
        // espera de un bloqueo y no haria un simple cambio de contrasena.
        const { error } = banned
          ? await authClient.admin.banUser({ userId })
          : await authClient.admin.unbanUser({ userId });
        if (error) throw new Error(error.message || "Failed to change access");
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["instance-users"] });
      queryClient.invalidateQueries({
        queryKey: ["workspace", "full", variables.workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["active-workspace-users", variables.workspaceId],
      });
    },
  });
}

export default useManageAccount;

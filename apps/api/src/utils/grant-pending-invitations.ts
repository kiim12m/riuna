import { eq } from "drizzle-orm";
import db, { schema } from "../database";
import { publishEvent } from "../events";
import { getUserPendingInvitations } from "./check-registration-allowed";

// `addMember` llega como parametro en vez de importarse: la utilidad la usa
// `auth.ts`, asi que importar `auth` aqui cerraria un ciclo que el empaquetado
// de esbuild no perdona. De paso permite probarla sin levantar Better Auth.
type AddMember = (body: {
  userId: string;
  organizationId: string;
  role: "owner";
}) => Promise<unknown>;

/**
 * Concede la pertenencia que una invitacion pendiente ya prometia, en cuanto
 * la cuenta existe.
 *
 * Se busca por correo y no por el identificador de la invitacion porque quien
 * entra por enlace magico o por OAuth nunca reenvia ese parametro, y su
 * invitacion se quedaria colgada.
 */
export async function grantPendingInvitations(
  user: { id: string; email: string },
  addMember: AddMember,
) {
  const invitations = await getUserPendingInvitations(user.email);

  for (const invitation of invitations) {
    await addMember({
      userId: user.id,
      organizationId: invitation.workspaceId,
      // Igual que en el resto del codigo: solo `owner` es rol estatico, los
      // demas se resuelven con control de acceso dinamico y el tipo inferido
      // no los conoce.
      role: (invitation.role ?? "member") as "owner",
    });

    await db
      .update(schema.invitationTable)
      .set({ status: "accepted" })
      .where(eq(schema.invitationTable.id, invitation.id));

    await publishEvent("workspace.member.added", {
      workspaceId: invitation.workspaceId,
      workspaceName: invitation.workspaceName,
      userId: user.id,
    });
  }

  return invitations.length;
}

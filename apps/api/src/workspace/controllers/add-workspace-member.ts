import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { auth } from "../../auth";
import db from "../../database";
import {
  userTable,
  workspaceTable,
  workspaceUserTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

type AddWorkspaceMemberParams = {
  workspaceId: string;
  email: string;
  role: string;
  headers: Headers;
};

export type AddWorkspaceMemberResult =
  | { status: "added"; userId: string }
  | { status: "invited"; invitationId: string };

async function addWorkspaceMember({
  workspaceId,
  email,
  role,
  headers,
}: AddWorkspaceMemberParams): Promise<AddWorkspaceMemberResult> {
  // La propiedad se transfiere por otro flujo. Sin esto, quien puede invitar
  // podria fabricarse un segundo propietario del espacio.
  if (role === "owner") {
    throw new HTTPException(400, {
      message: "The owner role cannot be granted when adding a member",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new HTTPException(400, { message: "An email address is required" });
  }

  const [workspace] = await db
    .select({ name: workspaceTable.name })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new HTTPException(404, { message: "Workspace not found" });
  }

  // La rama se decide aqui y no en el cliente a proposito: si el navegador
  // preguntase si un correo tiene cuenta para elegir camino, cualquier admin
  // de espacio tendria un oraculo de enumeracion de toda la instancia.
  const [existingUser] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, normalizedEmail))
    .limit(1);

  // Sin cuenta no puede haber pertenencia: `workspace_member.user_id` apunta a
  // `user.id`. La invitacion queda como testigo de registro —y como llave que
  // abre el alta con el registro cerrado—, no como algo que haya que aceptar:
  // al crearse la cuenta, `grantPendingInvitations` concede el acceso solo.
  if (!existingUser) {
    const invitation = await auth.api.createInvitation({
      body: {
        email: normalizedEmail,
        role: role as "member",
        organizationId: workspaceId,
      },
      headers,
    });

    return { status: "invited", invitationId: invitation.id };
  }

  const [alreadyMember] = await db
    .select({ id: workspaceUserTable.id })
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        eq(workspaceUserTable.userId, existingUser.id),
      ),
    )
    .limit(1);

  // Better Auth tambien lo rechaza, pero con un 400 generico. Comprobarlo
  // antes permite decir que ya es miembro.
  if (alreadyMember) {
    throw new HTTPException(409, {
      message: "That user is already a member of this workspace",
    });
  }

  await auth.api.addMember({
    body: {
      userId: existingUser.id,
      organizationId: workspaceId,
      // El plugin de organizacion solo declara `owner` como rol estatico (ver
      // auth.ts): `member`, `admin` y `viewer` se siembran por espacio y se
      // resuelven con control de acceso dinamico, asi que el tipo inferido no
      // los conoce aunque en ejecucion sean validos.
      role: role as "owner",
    },
    headers,
  });

  await publishEvent("workspace.member.added", {
    workspaceId,
    workspaceName: workspace.name,
    userId: existingUser.id,
  });

  return { status: "added", userId: existingUser.id };
}

export default addWorkspaceMember;

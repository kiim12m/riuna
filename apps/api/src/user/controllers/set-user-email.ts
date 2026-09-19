import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { userTable } from "../../database/schema";
import { assertInstanceAdmin } from "../../utils/instance-admin";
import { isLocalAccountEmail } from "../../utils/local-account";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SetUserEmailParams = {
  actorId: string;
  userId: string;
  email: string;
};

/**
 * Da una direccion real a una cuenta local y con eso deja de serlo: recupera
 * las notificaciones por correo y puede entrar con cualquiera de las dos
 * llaves, porque el nombre de usuario se conserva.
 *
 * El correo se marca como verificado sin enviar nada: lo pone el admin de
 * instancia, que es quien responde de la cuenta, y en una instancia sin SMTP
 * no habria forma de verificarlo.
 */
export async function setUserEmail({
  actorId,
  userId,
  email,
}: SetUserEmailParams) {
  await assertInstanceAdmin(actorId);

  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw new HTTPException(400, { message: "Invalid email address" });
  }

  if (isLocalAccountEmail(normalizedEmail)) {
    throw new HTTPException(400, {
      message:
        "That domain is reserved for local accounts and cannot be assigned by hand",
    });
  }

  const [target] = await db
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  if (!target) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const [taken] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, normalizedEmail))
    .limit(1);

  if (taken && taken.id !== userId) {
    throw new HTTPException(409, {
      message: `The address "${normalizedEmail}" belongs to another account`,
    });
  }

  const [updated] = await db
    .update(userTable)
    .set({
      email: normalizedEmail,
      emailVerified: true,
      isLocalAccount: false,
    })
    .where(eq(userTable.id, userId))
    .returning({
      id: userTable.id,
      email: userTable.email,
      isLocalAccount: userTable.isLocalAccount,
    });

  return updated;
}

export default setUserEmail;

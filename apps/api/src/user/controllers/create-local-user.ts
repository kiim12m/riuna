import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { auth } from "../../auth";
import db from "../../database";
import { userTable } from "../../database/schema";
import { assertInstanceAdmin } from "../../utils/instance-admin";
import { buildLocalAccountEmail } from "../../utils/local-account";

// Minusculas, digitos y separadores. Sin arroba a proposito: el formulario de
// acceso distingue usuario de correo por ese caracter.
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

type CreateLocalUserParams = {
  actorId: string;
  username: string;
  displayName: string;
  password: string;
  workspaceId: string;
  role: string;
  headers: Headers;
};

export async function createLocalUser({
  actorId,
  username,
  displayName,
  password,
  workspaceId,
  role,
  headers,
}: CreateLocalUserParams) {
  // Crear una cuenta da acceso al servidor entero, no solo a un espacio de
  // trabajo, de ahi la guarda de instancia.
  await assertInstanceAdmin(actorId);

  const normalizedUsername = username.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new HTTPException(400, {
      message:
        "Username must be 3-32 characters using lowercase letters, digits, dot, dash or underscore",
    });
  }

  // Se comprueba antes de llamar a Better Auth para poder decir que el nombre
  // esta cogido, en vez de devolver un fallo de restriccion unica.
  const [taken] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.username, normalizedUsername))
    .limit(1);

  if (taken) {
    throw new HTTPException(409, {
      message: `The username "${normalizedUsername}" is already taken`,
    });
  }

  const created = await auth.api.createUser({
    body: {
      email: buildLocalAccountEmail(normalizedUsername),
      password,
      name: displayName.trim(),
      data: {
        username: normalizedUsername,
        displayUsername: displayName.trim(),
        isLocalAccount: true,
        // No hay correo que verificar, y sin esto la cuenta nace en un estado
        // que nadie puede resolver.
        emailVerified: true,
      },
    },
    headers,
  });

  const userId = created?.user?.id;

  if (!userId) {
    throw new HTTPException(500, {
      message: "The local account was not created",
    });
  }

  await auth.api.addMember({
    body: {
      userId,
      organizationId: workspaceId,
      // El plugin de organizacion solo declara `owner` como rol estatico
      // (ver auth.ts): `member`, `admin` y `viewer` se siembran por espacio y
      // se resuelven con control de acceso dinamico, asi que el tipo inferido
      // no los conoce aunque en ejecucion sean validos.
      role: role as "owner",
    },
    headers,
  });

  return {
    id: userId,
    username: normalizedUsername,
    name: displayName.trim(),
    role,
  };
}

export default createLocalUser;

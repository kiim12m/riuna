import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { userTable } from "../database/schema";

// El rol de instancia lo recibe el primer usuario al registrarse (ver el hook
// de auth.ts). Es la guarda de todo lo que afecta a cuentas del servidor y no
// a un espacio de trabajo: crearlas, cambiarles la contrasena o bloquearlas.
export async function assertInstanceAdmin(actorId: string) {
  const [actor] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, actorId))
    .limit(1);

  if (actor?.role !== "admin") {
    throw new HTTPException(403, {
      message: "Only the instance admin can manage accounts",
    });
  }
}

export default assertInstanceAdmin;

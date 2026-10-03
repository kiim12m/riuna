import { loadStandups } from "./standup-batch";

/**
 * El stand-up de una persona (sub-bloque 2.4): derivado, sin guardar. Ayer
 * -el ultimo dia laborable- lo terminado; hoy, el plan con las
 * imprescindibles delante; y los bloqueos del cierre mas reciente.
 *
 * Es `loadStandups` con una sola persona —la misma implementacion que usa el
 * responsable para su gente—, y por eso **nunca lee la valoracion**: la prueba
 * de arquitectura de la ADR 054 falla si este fichero nombra la tabla privada.
 */
export async function getStandup({
  workspaceId,
  userId,
  now = new Date(),
}: {
  workspaceId: string;
  userId: string;
  now?: Date;
}) {
  const standups = await loadStandups({ workspaceId, userIds: [userId], now });
  const standup = standups.get(userId);
  if (!standup) throw new Error("The stand-up of the user was not loaded");
  return standup;
}

/**
 * Drizzle envuelve el error de Postgres en un `DrizzleQueryError` y deja el
 * original en `cause`, asi que el codigo **no** esta en el primer nivel. Se
 * miran los dos por si la version cambia de opinion.
 *
 * Tercera aparicion identica (`cycle/update-cycle.ts`,
 * `dashboard/get-dashboards.ts`) -regla de los tres de AGENTS.md-, ahora
 * compartida.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

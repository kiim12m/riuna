// Las cuentas locales no tienen correo real: se les genera uno sintetico en un
// dominio reservado, porque `user.email` es NOT NULL UNIQUE en el nucleo de
// Better Auth y no se puede tocar. Ese dominio se decide aqui y solo aqui.
const DEFAULT_LOCAL_ACCOUNT_DOMAIN = "local.riuna";

export function getLocalAccountDomain(): string {
  return process.env.RIUNA_LOCAL_ACCOUNT_DOMAIN || DEFAULT_LOCAL_ACCOUNT_DOMAIN;
}

export function buildLocalAccountEmail(username: string): string {
  return `${username}@${getLocalAccountDomain()}`;
}

export function isLocalAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email
    .toLowerCase()
    .endsWith(`@${getLocalAccountDomain().toLowerCase()}`);
}

import caES from "../../../../i18n/ca-ES.json";
import enUS from "../../../../i18n/en-US.json";
import esES from "../../../../i18n/es-ES.json";

const messages = {
  ca: caES.invitations.email,
  en: enUS.invitations.email,
  es: esES.invitations.email,
} as const;

// El español es el idioma por defecto de Riuna, y por tanto el de reserva
// también en los correos de invitación.
export function getWorkspaceInvitationEmailCopy(locale?: string | null) {
  const normalizedLocale = locale?.toLowerCase();

  if (normalizedLocale?.startsWith("ca")) return messages.ca;
  if (normalizedLocale?.startsWith("en")) return messages.en;

  return messages.es;
}

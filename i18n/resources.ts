// Riuna mantiene un conjunto reducido de idiomas: los 15 restantes que traía
// Kaneo se eliminaron en la Fase 0 para no arrastrar traducciones que nadie
// revisa. El catalán se añadirá aquí en cuanto exista `ca-ES.json`; hasta
// entonces, un navegador en catalán resuelve al idioma por defecto.
export const supportedLocales = ["ca-ES", "en-US", "es-ES"] as const;

export type AppLocale = (typeof supportedLocales)[number];

// El español es el idioma del equipo y, por tanto, también el de reserva: las
// claves que falten en otro idioma se muestran en español, no en inglés.
export const defaultLocale: AppLocale = "es-ES";

export function isSupportedLocale(locale: string): locale is AppLocale {
  return (supportedLocales as readonly string[]).includes(locale);
}

export async function loadLocale(locale: AppLocale): Promise<object> {
  switch (locale) {
    case "ca-ES":
      return (await import("./ca-ES.json")).default;
    case "en-US":
      return (await import("./en-US.json")).default;
    case "es-ES":
      return (await import("./es-ES.json")).default;
  }
}

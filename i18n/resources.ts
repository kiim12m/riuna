// Riuna mantiene un conjunto reducido de idiomas: los 15 restantes que traía
// Kaneo se eliminaron en la Fase 0 para no arrastrar traducciones que nadie
// revisa.
//
// **El catalán está fuera a propósito.** `ca-ES.json` existe y tiene las 1.879
// claves, pero solo 250 valores (13,3%) están traducidos de verdad: el resto es
// español copiado, y la paridad de claves lo disimulaba. Ofrecerlo en el
// selector enseñaba la aplicación en español —`settings` al 4%, `tasks` al 3%,
// `auth` al 1,4%, `workspace` y `notifications` al 0%— diciendo que estaba en
// catalán. Sin él, un navegador en catalán cae al español, que es exactamente
// lo que ya veía, pero sin la promesa falsa.
//
// Se reactiva devolviendo "ca-ES" a esta lista el día que las claves existan;
// el fichero y el caso de `loadLocale` se conservan para eso.
export const supportedLocales = ["en-US", "es-ES"] as const;

export type AppLocale = (typeof supportedLocales)[number];

// El español es el idioma del equipo y, por tanto, también el de reserva: las
// claves que falten en otro idioma se muestran en español, no en inglés.
export const defaultLocale: AppLocale = "es-ES";

export function isSupportedLocale(locale: string): locale is AppLocale {
  return (supportedLocales as readonly string[]).includes(locale);
}

export async function loadLocale(locale: AppLocale): Promise<object> {
  switch (locale) {
    case "en-US":
      return (await import("./en-US.json")).default;
    case "es-ES":
      return (await import("./es-ES.json")).default;
  }
}

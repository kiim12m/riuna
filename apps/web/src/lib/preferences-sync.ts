/**
 * Las preferencias que viajan con la cuenta (ADR 064). El tema no esta: es del
 * dispositivo. Los valores por defecto tienen que coincidir con los del
 * almacen (`store/user-preferences.ts`); una prueba lo vigila.
 */
export type SyncedPreferences = {
  viewMode: "board" | "list";
  compactMode: boolean;
  showTaskNumbers: boolean;
  showAssignees: boolean;
  showDueDates: boolean;
  showLabels: boolean;
  showPriority: boolean;
  sidebarDefaultOpen: boolean;
  weekStartsOn: 0 | 1 | 6;
};

export const SYNCED_DEFAULTS = {
  viewMode: "board",
  compactMode: false,
  showTaskNumbers: true,
  showAssignees: true,
  showDueDates: true,
  showLabels: true,
  showPriority: true,
  sidebarDefaultOpen: true,
  weekStartsOn: 0,
} as const satisfies SyncedPreferences;

export type SyncedKey = keyof typeof SYNCED_DEFAULTS;
export const SYNCED_KEYS = Object.keys(SYNCED_DEFAULTS) as SyncedKey[];

type Synced = SyncedPreferences;

/** Solo las claves que viajan, de cualquier estado del almacen. */
export function pickSynced(state: Partial<Synced>): Partial<Synced> {
  const picked: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) {
    if (state[key] !== undefined) picked[key] = state[key];
  }
  return picked as Partial<Synced>;
}

/** Lo que cambio entre dos estados, solo de las claves que viajan. */
export function changedKeys(
  before: Partial<Synced>,
  after: Partial<Synced>,
): SyncedKey[] {
  return SYNCED_KEYS.filter((key) => before[key] !== after[key]);
}

/**
 * Lo que se aplica al almacen cuando llegan las preferencias del servidor: lo
 * que trae, sin las claves que la persona ha tocado mientras tanto —su cambio
 * mas reciente gana— y sin lo que no sea un valor valido para esa clave, que un
 * servidor mas nuevo o mas viejo podria mandar.
 */
export function applicableFromServer(
  server: Record<string, unknown>,
  touchedLocally: ReadonlySet<SyncedKey>,
): Partial<Synced> {
  const applicable: Record<string, unknown> = {};

  for (const key of SYNCED_KEYS) {
    const value = server[key];
    if (value === undefined || touchedLocally.has(key)) continue;
    if (typeof value !== typeof SYNCED_DEFAULTS[key]) continue;
    if (key === "weekStartsOn" && ![0, 1, 6].includes(value as number))
      continue;
    if (key === "viewMode" && value !== "board" && value !== "list") continue;
    applicable[key] = value;
  }

  return applicable as Partial<Synced>;
}

/**
 * Lo que sube la primera vez que el servidor no tiene nada: lo que esta
 * navegador ya habia personalizado, para que cambiar de navegador no lo pierda.
 * Lo que sigue en su valor por defecto no se sube: no es una decision.
 */
export function differingFromDefaults(local: Partial<Synced>): Partial<Synced> {
  const differing: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) {
    if (local[key] !== undefined && local[key] !== SYNCED_DEFAULTS[key]) {
      differing[key] = local[key];
    }
  }
  return differing as Partial<Synced>;
}

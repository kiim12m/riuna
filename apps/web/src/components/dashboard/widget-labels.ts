/** La misma clave que usa el servidor en `aggregate.ts`. */
export const OTHER_BUCKET_KEY = "__other__";

import type { TFunction } from "i18next";
import type { WidgetGroupBy } from "@/fetchers/dashboard";
import { getPriorityLabel } from "@/lib/i18n/domain";

export type KeyLabel = {
  label: string;
  color?: string | null;
  icon?: string | null;
};

/**
 * La agrupacion con la que el servidor calculo de verdad los cubos.
 *
 * No siempre es `config.groupBy`: para varios tipos la deriva `resolveWidget`
 * en `dashboard/widget-config.ts` y **no la guarda en el `config`**. Una
 * tendencia agrupa siempre por tiempo, pero su `config` no lo dice, asi que
 * leer `config.groupBy` a secas devolvia `undefined` y todo eje de tendencia se
 * rotulaba «Desconocido» con los datos correctos debajo.
 *
 * Es la misma tabla que el servidor; si alli se anade un tipo, aqui tambien.
 */
export function effectiveGroupBy(
  type: string,
  config: { groupBy?: WidgetGroupBy },
): WidgetGroupBy | undefined {
  switch (type) {
    case "trend":
      return "time";
    case "time":
      // `none` es el total sin repartir: un solo cubo sin clave, asi que no hay
      // etiqueta que resolver.
      return config.groupBy === "none"
        ? undefined
        : (config.groupBy ?? "assignee");
    case "epic_progress":
      return "epic";
    case "breakdown":
      return config.groupBy;
    default:
      return undefined;
  }
}

/**
 * El rotulo de un cubo.
 *
 * Los agregados devuelven claves opacas y la API resuelve solo las que viven en
 * la base —proyecto, persona, equipo, epica, columna—. Prioridad, "hecha",
 * ventana de vencimiento y los cubos de tiempo son vocabularios cerrados: sus
 * nombres son claves de i18n, y el unico que sabe en que idioma esta el cliente.
 */
export function bucketLabel(
  key: string | null,
  groupBy: WidgetGroupBy | undefined,
  labels: Record<string, KeyLabel> | undefined,
  t: TFunction,
  language: string,
): string {
  if (key === null) return t("panels:buckets.none");

  // La cola de un reparto de alta cardinalidad, sumada por el servidor en vez de
  // cortada: sin esto la tarta no sumaba el total y nadie sabia por que.
  if (key === OTHER_BUCKET_KEY) return t("panels:buckets.other");

  switch (groupBy) {
    case "priority":
      return getPriorityLabel(key);
    case "done":
      return key === "true"
        ? t("panels:buckets.done")
        : t("panels:buckets.notDone");
    case "dueWindow":
      return t(`panels:buckets.due.${key}`);
    case "time":
      return formatBucketDate(key, language);
    default:
      return labels?.[key]?.label ?? t("panels:buckets.unknown");
  }
}

/** Los cubos de tiempo llegan como texto, no como fecha. Ver `aggregate.ts`. */
function formatBucketDate(key: string, language: string): string {
  const date = new Date(key);
  if (Number.isNaN(date.getTime())) return key;

  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "short",
  }).format(date);
}

/** Segundos a horas con un decimal, la unidad que usa el resto del producto. */
export function toHours(seconds: number): number {
  return Math.round((seconds / 3600) * 10) / 10;
}

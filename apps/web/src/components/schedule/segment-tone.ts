import { cn } from "@/lib/cn";

/**
 * Los cinco tonos del Cronograma (`docs/design-previews/barra-lateral.html`):
 * tinte suave y un filete de color a la izquierda, sin sombra. Viven aqui y no
 * en cada componente porque la leyenda tiene que decir exactamente lo mismo
 * que la rejilla y la vista Mes; con las clases copiadas a mano, la primera
 * que cambiase dejaria a la leyenda mintiendo.
 *
 * - `plan`: lo que fluye desde el plan personal (teal, la accion).
 * - `fixed`: lo que tiene hora fija, tarea anclada o cita (navy, sostiene).
 * - `running`: el cronometro en marcha (ambar, como su fila en Hoy).
 * - `closed`: bloqueo o comida, rayado porque ahi no cabe nada.
 * - `projected`: una recurrente que aun no existe, solo contorno.
 */
export const SEGMENT_TONE = {
  plan: "border-l-brand bg-brand/15",
  fixed: "border-l-primary bg-primary/10",
  running: "border-l-warning bg-warning/15",
  closed: "riuna-stripes border-l-muted-foreground/40 text-muted-foreground",
  projected:
    "border border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground",
} as const;

export type SegmentTone = keyof typeof SEGMENT_TONE;

/**
 * El tono con su forma. El filete va despues del tono: en `projected` un
 * `border` a secas detras de `border-l-[3px]` se lo comeria en `cn()`.
 */
export function segmentToneClass(tone: SegmentTone, className?: string) {
  return cn(SEGMENT_TONE[tone], "rounded-sm border-l-[3px]", className);
}

import labelColors from "@/constants/label-colors";

/**
 * Las epicas guardan el mismo token de color que las etiquetas (`teal`,
 * `red`…) y no un valor CSS, para que el tema claro y el oscuro los resuelvan
 * cada uno por su cuenta. Un color libre tambien vale: es lo que llegaria de
 * una importacion.
 */
export function resolveEpicColor(value: string | null | undefined): string {
  if (!value) return "var(--color-neutral-400)";

  const mapped = labelColors.find((color) => color.value === value)?.color;
  return mapped ?? value;
}

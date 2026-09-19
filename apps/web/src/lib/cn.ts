import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Los siete papeles de la escala de `marca.md` §05, declarados como **tamano**.
 *
 * Sin esto, tailwind-merge no puede saber que `text-label` es un tamano: no
 * esta en su escala conocida (`xs`, `sm`, `base`…) ni es un valor arbitrario
 * con unidad, asi que lo clasifica como **color** y lo mete en el mismo grupo
 * que `text-muted-foreground`. En cuanto los dos coinciden dentro de un `cn()`
 * —y coinciden en cada chip de estado— gana el ultimo y **el tamano se cae en
 * silencio**: el elemento hereda 16 px y nadie ve un error.
 *
 * Es la misma trampa del prefijo `text-` que ya documento la ADR 018 con
 * `text-secondary`, ahora por el otro lado: alli un tamano compilaba a color,
 * aqui un tamano se descarta *como si* fuera color.
 */
const TYPE_SCALE = [
  "display",
  "page",
  "section",
  "body",
  "meta",
  "label",
  "mono",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TYPE_SCALE }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

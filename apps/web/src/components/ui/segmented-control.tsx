"use client";

import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/cn";

type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: ReactNode;
};

type SegmentedControlProps<Value extends string> = {
  /** Nombre accesible del grupo. Obligatorio: sin el, el grupo no dice de que. */
  label: string;
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly SegmentedControlOption<Value>[];
  size?: "sm" | "default";
  className?: string;
};

/**
 * Eleccion excluyente de dos a cinco opciones cortas.
 *
 * Se apoya en `ToggleGroup` de Base UI, que ya trae la semantica de grupo, el
 * foco en anillo y el recorrido con flechas. Antes habia tres copias escritas a
 * mano con dos aspectos distintos —Gantt, Ciclos y «Mi trabajo»—, y dos de
 * ellas sin ninguna senal de foco de teclado.
 *
 * El seleccionado lleva `bg-accent` **y** una barra de marca de 2 px abajo: en
 * tema oscuro `--muted` ya es blanco al 5 %, asi que un relleno diluido sobre el
 * fondo de la pagina no se distingue, y la barra cumple ademas el principio 2 de
 * `marca.md` —el estado no se codifica solo en color—.
 */
export function SegmentedControl<Value extends string>({
  label,
  value,
  onValueChange,
  options,
  size = "sm",
  className,
}: SegmentedControlProps<Value>) {
  return (
    <ToggleGroup
      aria-label={label}
      className={cn(
        "gap-0.5 rounded-lg border border-border/80 bg-card p-0.5",
        className,
      )}
      size={size}
      value={[value]}
      // `multiple` es false, asi que volver a pulsar el activo devuelve []. Un
      // control de eleccion excluyente siempre tiene un valor: se ignora el
      // vacio en lugar de dejar la vista sin criterio.
      onValueChange={(next) => {
        const [picked] = next;
        if (picked && picked !== value) {
          onValueChange(picked as Value);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          size={size}
          className="rounded-md px-2.5 font-normal text-muted-foreground text-xs transition-[color,background-color,box-shadow] duration-(--motion-fast) data-pressed:bg-accent data-pressed:text-foreground data-pressed:shadow-[inset_0_-2px_0_var(--brand)] hover:text-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

import { Play, Square } from "lucide-react";
import { cn } from "@/lib/cn";

type TimerButtonProps = {
  running: boolean;
  onClick: (event: React.MouseEvent) => void;
  label: string;
  disabled?: boolean;
  /**
   * `row`: el boton con chrome propio de una fila de tarea (Hoy, el
   * Planificador) -22 px, con borde-. `plain`: solo el icono, para el pie de
   * la barra lateral, que ya tiene su propio fondo.
   */
  variant?: "row" | "plain";
  className?: string;
};

/**
 * Arrancar/parar, con el mismo ambar que ya usa el bloque "en marcha" del
 * Cronograma cuando esta corriendo -no es un color nuevo, es `--warning`-.
 */
export function TimerButton({
  running,
  onClick,
  label,
  disabled,
  variant = "row",
  className,
}: TimerButtonProps) {
  const Icon = running ? Square : Play;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex shrink-0 items-center justify-center transition-colors duration-(--motion-fast) ease-out-quart disabled:pointer-events-none disabled:opacity-50",
        variant === "row" &&
          cn(
            "size-[22px] rounded-md border",
            running
              ? "border-transparent bg-warning/18 text-warning-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          ),
        variant === "plain" &&
          cn(
            "size-4",
            running
              ? "text-warning-foreground"
              : "text-current hover:opacity-80",
          ),
        className,
      )}
    >
      <Icon
        className={variant === "row" ? "size-2.5" : "size-3.5"}
        fill="currentColor"
        strokeWidth={0}
      />
    </button>
  );
}

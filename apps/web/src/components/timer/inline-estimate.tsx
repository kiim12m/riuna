import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  formatDuration,
  parseDurationInput,
  secondsToHours,
} from "@/lib/duration";
import { toast } from "@/lib/toast";

/**
 * Lo que queda de una tarea, editable en el sitio -la tarjeta del
 * Planificador y la fila de Hoy, ADR 045-. Un `<button>` dentro de un
 * `<button>` (la tarjeta entera) o dentro de un tirador de `dnd-kit` es
 * contenido interactivo anidado, asi que `click` y `pointerdown` paran su
 * propagacion: sin eso, pulsar aqui abriria el detalle o arrancaria un
 * arrastre.
 */
export function InlineEstimate({
  estimate,
  loggedSeconds,
  onSave,
  disabled,
  className,
}: {
  estimate: number | null;
  loggedSeconds: number;
  onSave: (seconds: number | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining =
    estimate == null ? null : Math.max(0, estimate - loggedSeconds);

  function startEditing(event: React.SyntheticEvent) {
    event.stopPropagation();
    if (disabled) return;
    // Se edita la estimacion total, no lo que queda: prellenarla con lo que
    // queda se comeria lo ya registrado en cuanto se guardara nada (el
    // convenio de super-productivity, que aqui se evita a proposito).
    setValue(estimate == null ? "" : String(secondsToHours(estimate)));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commit() {
    const parsed = parseDurationInput(value);
    if (parsed === undefined) {
      toast.error(t("tasks:tree.estimateError"));
      return;
    }
    setEditing(false);
    if (parsed !== estimate) onSave(parsed);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
          }
        }}
        // biome-ignore lint/a11y/noAutofocus: se abre por un clic explicito del usuario, no al cargar la pagina
        autoFocus
        className={`w-14 rounded border border-border bg-background px-1 text-right font-mono text-meta tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      onPointerDown={(event) => event.stopPropagation()}
      disabled={disabled}
      className={`shrink-0 rounded px-1 font-mono text-meta text-muted-foreground tabular-nums hover:bg-accent hover:text-foreground disabled:pointer-events-none ${className ?? ""}`}
    >
      {remaining == null ? "—" : formatDuration(remaining, i18n.language)}
    </button>
  );
}

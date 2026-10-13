import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";

/**
 * «Incluir los subproyectos» (ADR 089) en las vistas de un padre: Lista,
 * Tabla, Gantt y Calendario. No sale en un proyecto sin hijos.
 */
export function SubprojectToggle({
  count,
  checked,
  onChange,
}: {
  count: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 text-xs">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        data-testid="include-subprojects"
      />
      <label htmlFor={id} className="whitespace-nowrap">
        {t("tasks:subprojects.include", { count })}
      </label>
    </div>
  );
}

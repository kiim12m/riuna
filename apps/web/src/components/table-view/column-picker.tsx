import { Columns3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { REQUIRED_COLUMN_ID, type TableColumnOption } from "./columns";

const KINDS = ["base", "custom", "aggregate"] as const;

/**
 * Elegir que columnas se ven. Los totales de la rama son opcionales y vienen
 * apagados: la tabla de siempre no cambia hasta que alguien los pide.
 */
export default function ColumnPicker({
  options,
  visible,
  onToggle,
}: {
  options: TableColumnOption[];
  visible: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="xs" className="gap-1.5" />}
      >
        <Columns3 className="size-3.5" />
        {t("tasks:table.columnsPicker.label")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
        {KINDS.map((kind, index) => {
          const group = options.filter((option) => option.kind === kind);
          if (group.length === 0) return null;

          return (
            <DropdownMenuGroup key={kind}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>
                {t(`tasks:table.columnsPicker.group.${kind}`)}
              </DropdownMenuLabel>
              {group.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={visible.has(option.id)}
                  disabled={option.id === REQUIRED_COLUMN_ID}
                  closeOnClick={false}
                  onCheckedChange={() => onToggle(option.id)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

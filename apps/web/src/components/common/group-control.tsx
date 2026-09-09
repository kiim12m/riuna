import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { GroupByField } from "@/lib/group-tasks";

type GroupControlProps = {
  groupBy: GroupByField;
  onGroupByChange: (groupBy: GroupByField) => void;
  disabled?: boolean;
  disabledHint?: string;
};

function CheckSlot({ checked }: { checked: boolean }) {
  return (
    <span
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background"
      }`}
    >
      {checked ? "✓" : null}
    </span>
  );
}

export default function GroupControl({
  groupBy,
  onGroupByChange,
  disabled = false,
  disabledHint,
}: GroupControlProps) {
  const { t } = useTranslation();
  const groupFields: { field: GroupByField; label: string }[] = [
    { field: "status", label: t("tasks:group.fields.status") },
    { field: "team", label: t("tasks:group.fields.team") },
    { field: "tree", label: t("tasks:group.fields.tree") },
  ];
  const isActive = !disabled && groupBy !== "status";
  const activeLabel = groupFields.find(
    (field) => field.field === groupBy,
  )?.label;

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={disabledHint}
        className="inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground opacity-60"
      >
        <Layers className="h-3 w-3" />
        {t("tasks:group.label")}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium outline-none ring-0 ${
              isActive
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border bg-background text-foreground hover:bg-accent/60"
            }`}
          />
        }
      >
        <Layers className="h-3 w-3" />
        {isActive ? activeLabel : t("tasks:group.label")}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-label uppercase">
            {t("tasks:group.by")}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {groupFields.map(({ field, label }) => (
          <DropdownMenuItem
            key={field}
            onClick={() => onGroupByChange(field)}
            className="h-8 rounded-md text-sm"
          >
            <CheckSlot checked={groupBy === field} />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

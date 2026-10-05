import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

type Assignee = { id: string; name: string | null; image: string | null };

const SIZES = {
  sm: "size-5",
  md: "size-6",
} as const;

/**
 * Quien tiene la tarea, en una tarjeta o una fila: todos los asignados
 * (ADR 010), no solo el responsable principal. Hasta `max` avatares
 * solapados y un «+N» con el resto; sin nadie, el «?» de «sin asignar».
 * El listado ya trae el conjunto completo, asi que no hace falta cruzar
 * `userId` con los miembros del espacio en cada tarjeta.
 */
export function AssigneeStack({
  assignees,
  size = "md",
  max = 3,
}: {
  assignees: readonly Assignee[];
  size?: keyof typeof SIZES;
  max?: number;
}) {
  const { t } = useTranslation();
  const box = SIZES[size];

  if (assignees.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full border border-border bg-muted",
          box,
        )}
        title={t("tasks:assignee.unassigned")}
      >
        <span className="font-medium text-label text-muted-foreground">?</span>
      </div>
    );
  }

  const shown = assignees.slice(0, max);
  const hidden = assignees.length - shown.length;
  const names = assignees.map((assignee) => assignee.name ?? "").join(", ");

  return (
    <div
      className="flex items-center -space-x-1"
      title={names}
      role="img"
      aria-label={names}
    >
      {shown.map((assignee) => (
        <Avatar
          key={assignee.id}
          className={cn(box, "ring-2 ring-card")}
          aria-hidden
        >
          <AvatarImage src={assignee.image ?? ""} alt="" />
          <AvatarFallback className="border border-border/30 font-medium text-xs">
            {getInitials(assignee.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {hidden > 0 && (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-muted font-medium text-label text-muted-foreground ring-2 ring-card",
            box,
          )}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}

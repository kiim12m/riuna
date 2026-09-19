import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import labelColors from "@/constants/label-colors";
import {
  useCreateEpic,
  useDeleteEpic,
  useUpdateEpic,
} from "@/hooks/mutations/epic/use-epic-mutations";
import useGetEpics from "@/hooks/queries/epic/use-get-epics";
import { cn } from "@/lib/cn";
import { resolveEpicColor } from "@/lib/epic-color";
import { toast } from "@/lib/toast";

// Se reutiliza la paleta de las etiquetas en vez de inventar otra: son el
// mismo gesto —elegir un color para distinguir de un vistazo— y dos paletas
// distintas en la misma pantalla se notan.
const EPIC_COLORS = labelColors.map((color) => color.value);

export default function EpicEditor({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: epics = [], isLoading } = useGetEpics(projectId);
  const { mutateAsync: createEpic, isPending: isCreating } =
    useCreateEpic(projectId);
  const { mutateAsync: updateEpic } = useUpdateEpic(projectId);
  const { mutateAsync: deleteEpic } = useDeleteEpic(projectId);

  const [name, setName] = useState("");
  const [color, setColor] = useState(EPIC_COLORS[0] ?? "#64748b");

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      await createEpic({ name: trimmed, color });
      setName("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:projectEpics.createError"),
      );
    }
  };

  const setArchived = async (epicId: string, archived: boolean) => {
    try {
      await updateEpic({ epicId, archived });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:projectEpics.updateError"),
      );
    }
  };

  const remove = async (epicId: string) => {
    try {
      await deleteEpic(epicId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:projectEpics.deleteError"),
      );
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {EPIC_COLORS.slice(0, 8).map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              onClick={() => setColor(option)}
              className={cn(
                "h-5 w-5 rounded-full border",
                color === option
                  ? "border-foreground ring-2 ring-ring/40"
                  : "border-border",
              )}
              style={{ backgroundColor: resolveEpicColor(option) }}
            />
          ))}
        </div>
        <Input
          size="sm"
          className="flex-1"
          placeholder={t("settings:projectEpics.namePlaceholder")}
          value={name}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setName(event.target.value)
          }
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") add();
          }}
        />
        <Button size="sm" onClick={add} disabled={!name.trim() || isCreating}>
          <Plus className="size-3.5" />
          {t("settings:projectEpics.addAction")}
        </Button>
      </div>

      {!isLoading && epics.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {t("settings:projectEpics.empty")}
        </p>
      )}

      <ul className="divide-y divide-border/60">
        {epics.map((epic) => (
          <li key={epic.id} className="flex items-center gap-2 py-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: resolveEpicColor(epic.color) }}
            />
            <span className="flex-1 truncate text-sm">{epic.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {epic.doneTaskCount}/{epic.taskCount}
            </span>
            <Button
              variant="ghost"
              size="xs"
              aria-label={
                epic.archivedAt
                  ? t("settings:projectEpics.unarchiveAction")
                  : t("settings:projectEpics.archiveAction")
              }
              onClick={() => setArchived(epic.id, !epic.archivedAt)}
            >
              {epic.archivedAt ? (
                <ArchiveRestore className="size-3.5" />
              ) : (
                <Archive className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-destructive"
              aria-label={t("settings:projectEpics.deleteAction")}
              onClick={() => remove(epic.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

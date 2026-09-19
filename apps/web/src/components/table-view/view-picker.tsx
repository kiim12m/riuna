import { Bookmark, Check, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";

export type SavedView = {
  id: string;
  name: string;
  isShared: boolean;
  createdBy: string;
  config: Record<string, unknown>;
};

type Props = {
  views: SavedView[];
  activeViewId?: string;
  currentUserId?: string;
  /** Hay algo que guardar: un filtro, o un modo distinto del de por defecto. */
  canSave: boolean;
  saving: boolean;
  onApply: (view: SavedView) => void;
  onSave: (name: string, isShared: boolean) => void;
  onDelete: (viewId: string) => void;
};

/**
 * El selector de vistas guardadas.
 *
 * Solo ofrece borrar las propias: la API rechaza con un 403 las ajenas, y un
 * boton que solo sirve para recibir un error es peor que no tenerlo. Un
 * administrador si puede borrarlas, pero eso se hace desde los ajustes y no
 * desde aqui.
 */
function ViewPicker({
  views,
  activeViewId,
  currentUserId,
  canSave,
  saving,
  onApply,
  onSave,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);

  const active = views.find((view) => view.id === activeViewId);

  const submit = () => {
    if (!name.trim()) return;
    onSave(name.trim(), isShared);
    setName("");
    setIsShared(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="h-6 gap-1 px-2 text-xs"
            />
          }
        >
          <Bookmark className="size-3" />
          {active?.name ?? t("tasks:table.views.label")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {views.length === 0 && (
            <DropdownMenuItem disabled className="h-8 text-sm">
              {t("tasks:table.views.empty")}
            </DropdownMenuItem>
          )}
          {views.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onClick={() => onApply(view)}
              className="h-8 justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {view.id === activeViewId ? (
                  <Check className="size-3 shrink-0" />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <span className="truncate">{view.name}</span>
                {view.isShared && (
                  <Users className="size-3 shrink-0 text-muted-foreground" />
                )}
              </span>
              {view.createdBy === currentUserId && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("tasks:table.views.delete")}
                  className="h-5 w-5 shrink-0 p-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(view.id);
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canSave}
            onClick={() => setIsSaveOpen(true)}
            className="h-8 text-sm"
          >
            {t("tasks:table.views.save")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isSaveOpen}
        onOpenChange={(next) => {
          if (!next) {
            setName("");
            setIsShared(false);
          }
          setIsSaveOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tasks:table.views.saveTitle")}</DialogTitle>
            <DialogDescription>
              {t("tasks:table.views.saveDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">{t("tasks:table.views.name")}</Label>
              <Input
                id="view-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("tasks:table.views.namePlaceholder")}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="view-shared"
                checked={isShared}
                onCheckedChange={(checked) => setIsShared(checked === true)}
              />
              <Label htmlFor="view-shared" className="text-sm font-normal">
                {t("tasks:table.views.share")}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsSaveOpen(false)}
              disabled={saving}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={submit} disabled={!name.trim() || saving}>
              {t("tasks:table.views.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ViewPicker;

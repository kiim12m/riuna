import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildWikiTree, type TreeNode, type TreeSource } from "./wiki-tree";

/** «Página nueva»: solo el titulo; el texto se escribe al abrirla. */
export function CreatePageDialog({
  open,
  pending,
  parentTitle,
  onClose,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  /** Si es una subpagina, de cual. */
  parentTitle?: string | null;
  onClose: () => void;
  onCreate: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!open) setTitle("");
  }, [open]);

  const submit = () => {
    if (title.trim()) onCreate(title.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("wiki:create.title")}</DialogTitle>
          <DialogDescription>
            {parentTitle
              ? t("wiki:create.under", { title: parentTitle })
              : t("wiki:create.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-1.5">
          <Label htmlFor="wiki-new-title">{t("wiki:create.name")}</Label>
          <Input
            id="wiki-new-title"
            autoFocus
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={submit} disabled={!title.trim() || pending}>
            {t("wiki:create.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROOT = "__root__";

/** «Mover a…»: otra pagina de la misma wiki, o la raiz. Nunca su rama. */
export function MovePageDialog<T extends TreeSource>({
  page,
  pages,
  pending,
  onClose,
  onMove,
}: {
  page: T | null;
  /** Las de su misma wiki: el espacio o el proyecto. */
  pages: T[];
  pending: boolean;
  onClose: () => void;
  onMove: (parentId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState(ROOT);

  useEffect(() => {
    setTarget(page?.parentId ?? ROOT);
  }, [page]);

  // Ni ella ni nada de su rama: colgarla de una hija cerraria un ciclo.
  const options: Array<TreeNode<T>> = [];
  const walk = (nodes: Array<TreeNode<T>>) => {
    for (const node of nodes) {
      if (node.id === page?.id) continue;
      options.push(node);
      walk(node.children);
    }
  };
  walk(buildWikiTree(pages));

  const label = (id: string) =>
    id === ROOT
      ? t("wiki:move.root")
      : (options.find((option) => option.id === id)?.title ?? "");

  return (
    <Dialog open={page !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("wiki:move.title", { title: page?.title })}
          </DialogTitle>
          <DialogDescription>{t("wiki:move.description")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-1.5">
          <Label htmlFor="wiki-move-parent">{t("wiki:move.parent")}</Label>
          <Select
            value={target}
            onValueChange={(next) => setTarget((next as string) ?? ROOT)}
          >
            <SelectTrigger id="wiki-move-parent">
              <SelectValue>{label(target)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT}>{t("wiki:move.root")}</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {`${" ".repeat(option.depth)}${option.title}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() => onMove(target === ROOT ? null : target)}
          >
            {t("wiki:move.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Borrar una pagina. Con subpaginas, quien borra elige (ADR 092): toda la
 * rama, o solo esta y sus hijas suben un nivel. Sin subpaginas, solo
 * confirmar.
 */
export function DeletePageDialog({
  page,
  descendants,
  pending,
  onClose,
  onDelete,
}: {
  page: { id: string; title: string } | null;
  descendants: number;
  pending: boolean;
  onClose: () => void;
  onDelete: (children: "lift" | "delete") => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"lift" | "delete">("lift");

  useEffect(() => {
    if (page) setMode("lift");
  }, [page]);

  return (
    <Dialog open={page !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("wiki:delete.title", { title: page?.title })}
          </DialogTitle>
          <DialogDescription>{t("wiki:delete.description")}</DialogDescription>
        </DialogHeader>
        {descendants > 0 && (
          <DialogPanel>
            <RadioGroup
              className="gap-3"
              value={mode}
              onValueChange={(value) =>
                setMode(value === "delete" ? "delete" : "lift")
              }
            >
              <label
                className="flex items-start gap-3"
                htmlFor="wiki-delete-lift"
              >
                <Radio className="mt-0.5" id="wiki-delete-lift" value="lift" />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-sm">{t("wiki:delete.lift")}</p>
                  <p className="text-muted-foreground text-xs">
                    {t("wiki:delete.liftHint", { count: descendants })}
                  </p>
                </div>
              </label>
              <label
                className="flex items-start gap-3"
                htmlFor="wiki-delete-branch"
              >
                <Radio
                  className="mt-0.5"
                  id="wiki-delete-branch"
                  value="delete"
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-sm">
                    {t("wiki:delete.branch", { count: descendants })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t("wiki:delete.branchHint")}
                  </p>
                </div>
              </label>
            </RadioGroup>
          </DialogPanel>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => onDelete(descendants > 0 ? mode : "lift")}
          >
            {mode === "delete" && descendants > 0
              ? t("wiki:delete.submitBranch", { count: descendants + 1 })
              : t("wiki:delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

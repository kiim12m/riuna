import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderInput,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { WikiPageSummary } from "@/fetchers/wiki";
import { cn } from "@/lib/cn";
import { buildWikiTree, type TreeNode } from "./wiki-tree";

type Node = TreeNode<WikiPageSummary>;

export type WikiGroup = {
  /** `null`: las paginas del espacio. */
  projectId: string | null;
  label: string;
  pages: WikiPageSummary[];
};

/**
 * El arbol de la wiki (ADR 092): un grupo «Espacio» y, dentro de un proyecto,
 * otro con las suyas, como en la maqueta. Cada pagina se pliega y, a quien
 * puede editar, ofrece subpagina, mover y borrar.
 */
export function WikiSidebar({
  groups,
  selectedId,
  canEdit,
  onSelect,
  onCreate,
  onMove,
  onDelete,
}: {
  groups: WikiGroup[];
  selectedId: string | undefined;
  canEdit: boolean;
  onSelect: (pageId: string) => void;
  onCreate: (scope: {
    projectId: string | null;
    parentId: string | null;
  }) => void;
  onMove: (page: WikiPageSummary) => void;
  onDelete: (page: WikiPageSummary) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (node: Node) => {
    const open = !collapsed.has(node.id);
    const selected = node.id === selectedId;
    return (
      <li key={node.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 text-sm",
            selected
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/60",
          )}
          style={{ paddingLeft: `${node.depth * 0.9 + 0.25}rem` }}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-label={
                open ? t("wiki:tree.collapse") : t("wiki:tree.expand")
              }
              className="inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-accent"
            >
              {open ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="inline-flex size-5 shrink-0 items-center justify-center">
              <FileText className="size-3.5" />
            </span>
          )}
          <button
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onSelect(node.id)}
            className="min-w-0 flex-1 truncate py-1 text-left"
          >
            {node.title}
          </button>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("wiki:tree.actions", { title: node.title })}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded opacity-0 hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() =>
                    onCreate({ projectId: node.projectId, parentId: node.id })
                  }
                >
                  <Plus className="size-4" />
                  {t("wiki:tree.newSubpage")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMove(node)}>
                  <FolderInput className="size-4" />
                  {t("wiki:tree.move")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(node)}
                >
                  <Trash2 className="size-4" />
                  {t("wiki:tree.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {open && node.children.length > 0 && (
          <ul>{node.children.map(renderNode)}</ul>
        )}
      </li>
    );
  };

  return (
    <nav
      aria-label={t("wiki:tree.label")}
      className="flex min-h-0 flex-col gap-3 overflow-y-auto p-2"
      data-testid="wiki-tree"
    >
      {groups.map((group) => (
        <section key={group.projectId ?? "workspace"} className="space-y-1">
          <div className="flex items-center justify-between gap-2 px-1.5">
            <h2 className="truncate font-semibold text-label uppercase text-muted-foreground">
              {group.label}
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  onCreate({ projectId: group.projectId, parentId: null })
                }
                aria-label={t("wiki:tree.newIn", { group: group.label })}
                className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </div>
          {group.pages.length > 0 ? (
            <ul className="space-y-0.5">
              {buildWikiTree(group.pages).map(renderNode)}
            </ul>
          ) : (
            <p className="px-1.5 text-label text-muted-foreground">
              {t("wiki:tree.empty")}
            </p>
          )}
        </section>
      ))}
    </nav>
  );
}

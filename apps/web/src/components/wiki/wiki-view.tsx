import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WikiPageSummary } from "@/fetchers/wiki";
import { useWikiMutations } from "@/hooks/mutations/wiki/use-wiki-mutations";
import { useWikiPage, useWikiPages } from "@/hooks/queries/wiki/use-wiki";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import {
  CreatePageDialog,
  DeletePageDialog,
  MovePageDialog,
} from "./wiki-dialogs";
import { WikiHistory } from "./wiki-history";
import { WikiPageView } from "./wiki-page-view";
import { type WikiGroup, WikiSidebar } from "./wiki-sidebar";
import { buildWikiTree, descendantIds } from "./wiki-tree";

type Scope = { projectId: string | null; parentId: string | null };

/**
 * La wiki de paginas (ADR 092): el arbol a la izquierda, la pagina en medio y
 * su historial a la derecha. Dentro de un proyecto enseña las paginas del
 * espacio y las suyas; fuera, solo las del espacio. Editar pide lo mismo que
 * editar tareas.
 */
export function WikiView({
  workspaceId,
  projectId,
  projectName,
  pageId,
  onOpenPage,
}: {
  workspaceId: string;
  projectId: string | null;
  projectName?: string;
  pageId: string | undefined;
  onOpenPage: (pageId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const { data: pages = [], isLoading } = useWikiPages(workspaceId, projectId);
  const { data: openPage } = useWikiPage(workspaceId, pageId);
  const { create, move, remove, restore } = useWikiMutations(workspaceId);

  const [creating, setCreating] = useState<Scope | null>(null);
  const [moving, setMoving] = useState<WikiPageSummary | null>(null);
  const [deleting, setDeleting] = useState<WikiPageSummary | null>(null);
  const [editOnOpen, setEditOnOpen] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const groups = useMemo<WikiGroup[]>(() => {
    const workspacePages = pages.filter((page) => !page.projectId);
    const list: WikiGroup[] = [
      {
        projectId: null,
        label: t("wiki:tree.workspace"),
        pages: workspacePages,
      },
    ];
    if (projectId) {
      list.push({
        projectId,
        label: projectName ?? t("wiki:tree.project"),
        pages: pages.filter((page) => page.projectId === projectId),
      });
    }
    return list;
  }, [pages, projectId, projectName, t]);

  // Sin pagina elegida se abre la primera: la del proyecto si la hay.
  useEffect(() => {
    if (pageId || isLoading || pages.length === 0) return;
    const ordered = [...groups]
      .reverse()
      .flatMap((group) => buildWikiTree(group.pages));
    const first = ordered[0];
    if (first) onOpenPage(first.id);
  }, [pageId, isLoading, pages.length, groups, onOpenPage]);

  const sameWiki = (page: { projectId: string | null }) =>
    pages.filter((candidate) => candidate.projectId === page.projectId);

  const handleCreate = async (title: string) => {
    if (!creating) return;
    try {
      const page = await create.mutateAsync({
        title,
        projectId: creating.projectId,
        parentId: creating.parentId,
      });
      setCreating(null);
      setEditOnOpen(page.id);
      onOpenPage(page.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("wiki:create.failed"),
      );
    }
  };

  const handleMove = async (parentId: string | null) => {
    if (!moving) return;
    try {
      await move.mutateAsync({ pageId: moving.id, parentId });
      setMoving(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("wiki:move.failed"),
      );
    }
  };

  const handleDelete = async (children: "lift" | "delete") => {
    if (!deleting) return;
    try {
      await remove.mutateAsync({ pageId: deleting.id, children });
      if (
        deleting.id === pageId ||
        (children === "delete" &&
          pageId &&
          descendantIds(pages, deleting.id).has(pageId))
      ) {
        onOpenPage(undefined);
      }
      setDeleting(null);
      toast.success(t("wiki:delete.done"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("wiki:delete.failed"),
      );
    }
  };

  const handleRestore = async (version: number) => {
    if (!openPage) return;
    try {
      await restore.mutateAsync({
        pageId: openPage.id,
        version,
        baseVersion: openPage.version,
      });
      toast.success(t("wiki:history.restored", { version }));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("wiki:history.restoreFailed"),
      );
    }
  };

  const toSummary = (page: { id: string }) =>
    pages.find((candidate) => candidate.id === page.id) ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_17rem]">
      <div className="hidden min-h-0 border-border/80 border-r bg-muted/30 md:flex md:flex-col">
        <WikiSidebar
          groups={groups}
          selectedId={pageId}
          canEdit={canEdit}
          onSelect={(id) => onOpenPage(id)}
          onCreate={setCreating}
          onMove={setMoving}
          onDelete={setDeleting}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
        {/* En el movil el arbol pasa a un desplegable. */}
        <div className="flex items-center gap-2 border-border/80 border-b p-2 md:hidden">
          <Select
            value={pageId ?? ""}
            onValueChange={(next) => next && onOpenPage(next as string)}
          >
            <SelectTrigger
              className="min-w-0 flex-1"
              aria-label={t("wiki:tree.label")}
            >
              <SelectValue>
                {pages.find((page) => page.id === pageId)?.title ??
                  t("wiki:tree.choose")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groups.flatMap((group) =>
                buildWikiTree(group.pages).flatMap(
                  function flat(node): React.ReactNode[] {
                    return [
                      <SelectItem key={node.id} value={node.id}>
                        {`${" ".repeat(node.depth)}${node.title}`}
                      </SelectItem>,
                      ...node.children.flatMap(flat),
                    ];
                  },
                ),
              )}
            </SelectContent>
          </Select>
          {canEdit && (
            <button
              type="button"
              className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs"
              onClick={() => setCreating({ projectId, parentId: null })}
            >
              {t("wiki:tree.newPage")}
            </button>
          )}
        </div>

        {pageId ? (
          <WikiPageView
            key={pageId}
            workspaceId={workspaceId}
            pageId={pageId}
            canEdit={canEdit}
            startEditing={editOnOpen === pageId}
            showHistory={showHistory}
            onToggleHistory={() => setShowHistory((value) => !value)}
            onNewSubpage={(page) =>
              setCreating({ projectId: page.projectId, parentId: page.id })
            }
            onMove={(page) => setMoving(toSummary(page))}
            onDelete={(page) => setDeleting(toSummary(page))}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <BookOpen className="size-6" />
            <p className="text-sm">
              {isLoading ? t("wiki:page.loading") : t("wiki:empty")}
            </p>
          </div>
        )}

        {/* Por debajo de `xl` el historial va debajo de la pagina. */}
        {openPage && showHistory && (
          <div className="border-border/80 border-t xl:hidden">
            <WikiHistory
              workspaceId={workspaceId}
              page={openPage}
              canEdit={canEdit}
              restoring={restore.isPending}
              onRestore={handleRestore}
            />
          </div>
        )}
      </div>

      <div className="hidden min-h-0 border-border/80 border-l xl:flex xl:flex-col">
        {openPage && (
          <WikiHistory
            workspaceId={workspaceId}
            page={openPage}
            canEdit={canEdit}
            restoring={restore.isPending}
            onRestore={handleRestore}
          />
        )}
      </div>

      <CreatePageDialog
        open={creating !== null}
        pending={create.isPending}
        parentTitle={
          creating?.parentId
            ? pages.find((page) => page.id === creating.parentId)?.title
            : null
        }
        onClose={() => setCreating(null)}
        onCreate={handleCreate}
      />
      <MovePageDialog
        page={moving}
        pages={moving ? sameWiki(moving) : []}
        pending={move.isPending}
        onClose={() => setMoving(null)}
        onMove={handleMove}
      />
      <DeletePageDialog
        page={deleting}
        descendants={deleting ? descendantIds(pages, deleting.id).size : 0}
        pending={remove.isPending}
        onClose={() => setDeleting(null)}
        onDelete={handleDelete}
      />
    </div>
  );
}

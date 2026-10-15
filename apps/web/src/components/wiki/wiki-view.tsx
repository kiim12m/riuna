import {
  BookOpen,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { useUserPreferencesStore } from "@/store/user-preferences";
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

// Cadenas enteras: Tailwind solo genera las clases que lee tal cual. La clave
// es «arbol abierto-historial abierto»; minimizado, cada lateral es una franja.
const COLUMNS: Record<`${boolean}-${boolean}`, string> = {
  "true-true":
    "md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_17rem]",
  "true-false":
    "md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_2.5rem]",
  "false-true":
    "md:grid-cols-[2.5rem_minmax(0,1fr)] xl:grid-cols-[2.5rem_minmax(0,1fr)_17rem]",
  "false-false":
    "md:grid-cols-[2.5rem_minmax(0,1fr)] xl:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]",
};

/** Un lateral minimizado: la franja con el boton que lo vuelve a abrir. */
function CollapsedRail({
  icon: Icon,
  label,
  onOpen,
}: {
  icon: LucideIcon;
  label: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex justify-center pt-3">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={label}
        onClick={onOpen}
      >
        <Icon className="size-4" />
      </Button>
    </div>
  );
}

/**
 * La wiki de paginas (ADR 092): el arbol a la izquierda, la pagina en medio y
 * su historial a la derecha. Los dos laterales se minimizan, empiezan
 * minimizados y este navegador recuerda como se dejaron. Dentro de un proyecto
 * enseña las paginas del espacio y las suyas; fuera, solo las del espacio.
 * Editar pide lo mismo que editar tareas.
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
  const treeOpen = useUserPreferencesStore((state) => state.wikiTreeOpen);
  const setTreeOpen = useUserPreferencesStore((state) => state.setWikiTreeOpen);
  const historyOpen = useUserPreferencesStore((state) => state.wikiHistoryOpen);
  const setHistoryOpen = useUserPreferencesStore(
    (state) => state.setWikiHistoryOpen,
  );

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
    <div
      className={cn(
        "grid h-full min-h-0 grid-cols-1",
        COLUMNS[`${treeOpen}-${historyOpen}`],
      )}
    >
      <div className="hidden min-h-0 border-border/80 border-r bg-muted/30 md:flex md:flex-col">
        {treeOpen ? (
          <>
            <div className="flex items-center justify-between gap-2 px-3 pt-3">
              <h2 className="flex items-center gap-1.5 font-medium text-sm">
                <BookOpen className="size-4 text-muted-foreground" />
                {t("wiki:tree.label")}
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("wiki:tree.hide")}
                title={t("wiki:tree.hide")}
                onClick={() => setTreeOpen(false)}
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </div>
            <WikiSidebar
              groups={groups}
              selectedId={pageId}
              canEdit={canEdit}
              onSelect={(id) => onOpenPage(id)}
              onCreate={setCreating}
              onMove={setMoving}
              onDelete={setDeleting}
            />
          </>
        ) : (
          <CollapsedRail
            icon={PanelLeftOpen}
            label={t("wiki:tree.show")}
            onOpen={() => setTreeOpen(true)}
          />
        )}
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
            showHistory={historyOpen}
            onToggleHistory={() => setHistoryOpen(!historyOpen)}
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
            {/* Con el arbol minimizado, la primera pagina se crea desde aqui;
                en el movil ya esta el boton de arriba. */}
            {!isLoading && canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="hidden md:inline-flex"
                onClick={() => setCreating({ projectId, parentId: null })}
              >
                <Plus className="size-3.5" />
                {t("wiki:tree.newPage")}
              </Button>
            )}
          </div>
        )}

        {/* Por debajo de `xl` el historial va debajo de la pagina. */}
        {openPage && historyOpen && (
          <div className="border-border/80 border-t xl:hidden">
            <WikiHistory
              workspaceId={workspaceId}
              page={openPage}
              canEdit={canEdit}
              restoring={restore.isPending}
              onRestore={handleRestore}
              onHide={() => setHistoryOpen(false)}
            />
          </div>
        )}
      </div>

      <div className="hidden min-h-0 border-border/80 border-l xl:flex xl:flex-col">
        {openPage &&
          (historyOpen ? (
            <WikiHistory
              workspaceId={workspaceId}
              page={openPage}
              canEdit={canEdit}
              restoring={restore.isPending}
              onRestore={handleRestore}
              onHide={() => setHistoryOpen(false)}
            />
          ) : (
            <CollapsedRail
              icon={PanelRightOpen}
              label={t("wiki:history.show")}
              onOpen={() => setHistoryOpen(true)}
            />
          ))}
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

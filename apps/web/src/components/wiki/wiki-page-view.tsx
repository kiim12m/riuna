import {
  AlertTriangle,
  FolderInput,
  History,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLinkCommands } from "@/components/editor/link-picker";
import RichMarkdownEditor from "@/components/editor/rich-markdown-editor";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import type { MentionMember } from "@/components/task/extensions/mention-list";
import { MentionSuggestion } from "@/components/task/extensions/mention-suggestion";
import { RiunaMention } from "@/components/task/extensions/riuna-mention";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { WikiPage } from "@/fetchers/wiki";
import { useWikiMutations } from "@/hooks/mutations/wiki/use-wiki-mutations";
import { useWikiPage } from "@/hooks/queries/wiki/use-wiki";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { formatRelativeTime } from "@/lib/format";
import { HttpError } from "@/lib/http-error";
import { diffLines, readableMarkdown } from "@/lib/line-diff";
import { toast } from "@/lib/toast";
import { uploadWikiImage } from "@/lib/upload-wiki-image";
import { clearWikiDraft, readWikiDraft, writeWikiDraft } from "./wiki-draft";
import { DiffView } from "./wiki-history";

type EditState = {
  /** Cada vez que se entra a editar, para que el editor se recargue. */
  session: number;
  baseVersion: number;
  title: string;
  initialContent: string;
};

const LINK_KINDS: Array<"page" | "task"> = ["task", "page"];

async function noUpload(): Promise<never> {
  throw new Error("Read only");
}

/**
 * Una pagina de la wiki (ADR 092): se lee con el editor de siempre en solo
 * lectura y se edita a mano, con un borrador en este navegador y bloqueo
 * optimista al guardar. Si alguien guarda mientras se edita, se avisa antes
 * de perder nada.
 */
export function WikiPageView({
  workspaceId,
  pageId,
  canEdit,
  startEditing,
  showHistory,
  onToggleHistory,
  onNewSubpage,
  onMove,
  onDelete,
}: {
  workspaceId: string;
  pageId: string;
  canEdit: boolean;
  /** Abrir directamente en edicion: una pagina recien creada. */
  startEditing: boolean;
  showHistory: boolean;
  onToggleHistory: () => void;
  onNewSubpage: (page: WikiPage) => void;
  onMove: (page: WikiPage) => void;
  onDelete: (page: WikiPage) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: page, isLoading, refetch } = useWikiPage(workspaceId, pageId);
  const { save } = useWikiMutations(workspaceId);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [note, setNote] = useState("");
  const [conflict, setConflict] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [recoverable, setRecoverable] = useState<ReturnType<
    typeof readWikiDraft
  > | null>(null);
  const titleRef = useRef("");
  const readMarkdownRef = useRef<() => string>(() => "");
  const sessionRef = useRef(0);

  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const membersRef = useRef<MentionMember[]>([]);
  membersRef.current = useMemo(
    () =>
      (workspaceUsers?.members ?? []).map((member) => ({
        id: member.userId,
        label: member.user?.name ?? member.user?.email ?? "",
        image: member.user?.image ?? null,
      })),
    [workspaceUsers],
  );
  // Estables: el editor lee sus extensiones una sola vez.
  const mentionExtensions = useMemo(
    () => [
      RiunaMention,
      MentionSuggestion.configure({ getMembers: () => membersRef.current }),
    ],
    [],
  );
  const { commands, picker } = useLinkCommands({
    workspaceId,
    kinds: LINK_KINDS,
  });

  const beginEdit = useCallback(
    (from?: { baseVersion: number; title: string; content: string }) => {
      if (!page) return;
      sessionRef.current += 1;
      titleRef.current = from?.title ?? page.title;
      setEdit({
        session: sessionRef.current,
        baseVersion: from?.baseVersion ?? page.version,
        title: from?.title ?? page.title,
        initialContent: from?.content ?? page.content,
      });
      setNote("");
      setConflict(false);
    },
    [page],
  );

  // Al cambiar de pagina se sale de la edicion; la nueva puede pedir entrar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar de pagina o al cargarla.
  useEffect(() => {
    setEdit(null);
    setConflict(false);
    if (!page || page.id !== pageId) return;
    const draft = readWikiDraft(pageId);
    const differs =
      draft && (draft.content !== page.content || draft.title !== page.title);
    setRecoverable(differs ? draft : null);
    if (startEditing && canEdit) beginEdit();
  }, [pageId, page?.id]);

  // Alguien guardo una version nueva mientras se edita: el canal de usuario
  // invalida la pagina y aqui se nota antes de perder nada.
  useEffect(() => {
    if (edit && page && page.version > edit.baseVersion) setConflict(true);
  }, [edit, page]);

  const persistDraft = (content: string) => {
    if (!edit) return;
    writeWikiDraft(pageId, {
      baseVersion: edit.baseVersion,
      title: titleRef.current,
      content,
    });
  };

  const submit = async (baseVersion: number) => {
    if (!edit) return;
    const content = readMarkdownRef.current();
    try {
      await save.mutateAsync({
        pageId,
        title: titleRef.current.trim() || edit.title,
        content,
        baseVersion,
        note: note.trim() || null,
      });
      clearWikiDraft(pageId);
      setRecoverable(null);
      setEdit(null);
      setConflict(false);
      toast.success(t("wiki:page.saved"));
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        writeWikiDraft(pageId, {
          baseVersion: edit.baseVersion,
          title: titleRef.current,
          content,
        });
        await refetch();
        setConflict(true);
        return;
      }
      toast.error(
        error instanceof Error ? error.message : t("wiki:page.saveFailed"),
      );
    }
  };

  const discardMine = () => {
    clearWikiDraft(pageId);
    setRecoverable(null);
    setEdit(null);
    setConflict(false);
  };

  const upload = useCallback(
    (file: File) => uploadWikiImage({ pageId, file }),
    [pageId],
  );
  const onReady = useCallback((read: () => string) => {
    readMarkdownRef.current = read;
  }, []);

  if (isLoading || !page) {
    return (
      <div className="p-6 text-muted-foreground text-sm">
        {isLoading ? t("wiki:page.loading") : t("wiki:page.missing")}
      </div>
    );
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.message(t("wiki:page.linkCopied"));
  };

  const theirsAuthor =
    page.updatedBy && page.updatedBy === user?.id
      ? t("wiki:conflict.you")
      : (page.updatedByName ?? t("wiki:conflict.someone"));

  return (
    <article
      className="flex min-w-0 flex-col gap-4 px-4 py-4 md:px-6"
      data-testid="wiki-page"
    >
      {recoverable && !edit && canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">{t("wiki:draft.found")}</span>
          <Button
            size="xs"
            onClick={() =>
              beginEdit({
                baseVersion: recoverable.baseVersion,
                title: recoverable.title,
                content: recoverable.content,
              })
            }
          >
            {t("wiki:draft.recover")}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              clearWikiDraft(pageId);
              setRecoverable(null);
            }}
          >
            {t("wiki:draft.discard")}
          </Button>
        </div>
      )}

      {edit && conflict && (
        <div
          role="alert"
          className="flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
          data-testid="wiki-conflict"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 space-y-2">
            <p>
              <span className="font-medium">
                {t("wiki:conflict.title", {
                  name: theirsAuthor,
                  when: formatRelativeTime(page.updatedAt),
                })}
              </span>{" "}
              <span className="text-muted-foreground">
                {t("wiki:conflict.detail", { version: page.version })}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="xs"
                variant="outline"
                onClick={() => setShowDiff(true)}
              >
                {t("wiki:conflict.diff")}
              </Button>
              <Button
                size="xs"
                disabled={save.isPending}
                onClick={() => submit(page.version)}
              >
                {t("wiki:conflict.overwrite")}
              </Button>
              <Button size="xs" variant="ghost" onClick={discardMine}>
                {t("wiki:conflict.discard")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-wrap items-start gap-3">
        {/* Con base propia: si no cabe, los botones bajan y el titulo no se
            estrecha hasta una palabra por linea. */}
        <div className="min-w-0 grow basis-64 space-y-1">
          {edit ? (
            <Input
              defaultValue={edit.title}
              aria-label={t("wiki:page.titleLabel")}
              maxLength={200}
              className="[&_[data-slot=input]]:h-auto [&_[data-slot=input]]:py-1.5 [&_[data-slot=input]]:text-page"
              onChange={(event) => {
                titleRef.current = event.target.value;
                persistDraft(readMarkdownRef.current());
              }}
            />
          ) : (
            <h1 className="text-page">{page.title}</h1>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted-foreground">
            <span>
              {t("wiki:page.meta", {
                version: page.version,
                name: page.updatedByName ?? "—",
                when: formatRelativeTime(page.updatedAt),
              })}
            </span>
            {page.links.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{t("wiki:page.linked")}</span>
                {page.links.map((link) => (
                  <a
                    key={link.taskId}
                    href={`/dashboard/workspace/${workspaceId}/project/${link.projectId}/task/${link.taskId}`}
                    title={link.title}
                    className="rounded bg-accent px-1.5 font-medium font-mono text-label text-foreground hover:underline"
                    data-testid="wiki-linked-task"
                  >
                    {`${link.projectSlug.toUpperCase()}-${link.number}`}
                  </a>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {edit ? (
            <>
              <span className="hidden text-label text-muted-foreground sm:inline">
                {t("wiki:draft.saving")}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
                {t("common:actions.cancel")}
              </Button>
              <Button
                size="sm"
                disabled={save.isPending}
                onClick={() => submit(edit.baseVersion)}
              >
                {t("wiki:page.save")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={showHistory}
                onClick={onToggleHistory}
              >
                <History className="size-3.5" />
                {t("wiki:history.title")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyLink}
                aria-label={t("wiki:page.copyLink")}
              >
                <Link2 className="size-3.5" />
              </Button>
              {canEdit && (
                <>
                  <Button size="sm" onClick={() => beginEdit()}>
                    <Pencil className="size-3.5" />
                    {t("wiki:page.edit")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={t("wiki:page.more")}
                      className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onNewSubpage(page)}>
                        <Plus className="size-4" />
                        {t("wiki:tree.newSubpage")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMove(page)}>
                        <FolderInput className="size-4" />
                        {t("wiki:tree.move")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDelete(page)}
                      >
                        <Trash2 className="size-4" />
                        {t("wiki:tree.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {edit ? (
        <>
          <RichMarkdownEditor
            key={`${page.id}:edit:${edit.session}`}
            documentKey={`${page.id}:edit:${edit.session}`}
            markdown={edit.initialContent}
            onChange={persistDraft}
            upload={upload}
            canEdit
            debounceMs={300}
            ariaLabel={t("wiki:page.editorLabel")}
            placeholder={t("wiki:page.placeholder")}
            extraExtensions={mentionExtensions}
            extraSlashCommands={commands}
            onReady={onReady}
          />
          <Input
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("wiki:page.notePlaceholder")}
            aria-label={t("wiki:page.noteLabel")}
            className="max-w-md"
          />
          {picker}
        </>
      ) : (
        <RichMarkdownEditor
          key={`${page.id}:read`}
          documentKey={`${page.id}:read`}
          markdown={page.content}
          onChange={() => {}}
          upload={noUpload}
          canEdit={false}
          ariaLabel={t("wiki:page.readerLabel")}
          placeholder={t("wiki:page.empty")}
          extraExtensions={mentionExtensions}
        />
      )}

      <Dialog open={showDiff} onOpenChange={setShowDiff}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("wiki:conflict.diffTitle", { version: page.version })}
            </DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <DiffView
              lines={diffLines(
                `${page.title}\n${readableMarkdown(page.content)}`,
                `${titleRef.current}\n${readableMarkdown(readMarkdownRef.current())}`,
              )}
            />
          </DialogPanel>
        </DialogContent>
      </Dialog>
    </article>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import { BookOpen, ListTodo } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  SlashCommand,
  SlashRange,
} from "@/components/editor/rich-markdown-editor";
import { wikiPageHref } from "@/components/task/extensions/riuna-page-link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import globalSearch from "@/fetchers/search/global-search";
import { cn } from "@/lib/cn";

type Kind = "task" | "page";

type PickerState = { kind: Kind; editor: Editor; position: number };

type Result = {
  id: string;
  label: string;
  hint: string;
  insert: (editor: Editor, position: number) => void;
};

/**
 * Los comandos `/tarea` y `/página` del menu de barra (ADR 092): abren un
 * buscador y meten la ficha elegida donde estaba el cursor. Una tarea entra
 * como la ficha de tarea de siempre; una pagina, como `riunaPageLink`, que es
 * lo que la descripcion de una tarea usa para enlazar la wiki.
 */
export function useLinkCommands({
  workspaceId,
  kinds,
}: {
  workspaceId: string;
  kinds: Kind[];
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<PickerState | null>(null);

  const open = useCallback(
    (kind: Kind) => (editor: Editor, range: SlashRange) => {
      editor.chain().focus().deleteRange(range).run();
      setState({ kind, editor, position: range.from });
    },
    [],
  );

  const commands = useMemo<SlashCommand[]>(
    () =>
      kinds.map((kind) =>
        kind === "task"
          ? {
              id: "link-task",
              label: t("wiki:links.task"),
              group: "insert" as const,
              search: "tarea task enlace link",
              run: open("task"),
            }
          : {
              id: "link-page",
              label: t("wiki:links.page"),
              group: "insert" as const,
              search: "pagina página page wiki enlace link",
              run: open("page"),
            },
      ),
    [kinds, open, t],
  );

  const picker = (
    <LinkPickerDialog
      workspaceId={workspaceId}
      state={state}
      onClose={() => setState(null)}
    />
  );

  return { commands, picker };
}

function LinkPickerDialog({
  workspaceId,
  state,
  onClose,
}: {
  workspaceId: string;
  state: PickerState | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!state) {
      setQuery("");
      setDebounced("");
    }
    setSelected(0);
  }, [state]);

  const { data } = useQuery({
    queryKey: ["link-picker", workspaceId, state?.kind, debounced],
    queryFn: () =>
      globalSearch({
        q: debounced,
        type: state?.kind === "page" ? "wiki" : "tasks",
        workspaceId,
        limit: 10,
      }),
    enabled: Boolean(state && debounced),
  });

  const results: Result[] = (data?.results ?? []).map((result) => {
    if (state?.kind === "page") {
      const href = wikiPageHref({
        id: result.id,
        workspaceId,
        projectId: result.projectId ?? null,
      });
      return {
        id: result.id,
        label: result.title,
        hint: result.projectName ?? t("wiki:tree.workspace"),
        insert: (editor, position) =>
          editor
            .chain()
            .focus()
            .insertContentAt(position, {
              type: "riunaPageLink",
              attrs: { pageId: result.id, title: result.title, url: href },
            })
            .run(),
      };
    }
    const key =
      result.projectSlug && result.taskNumber
        ? `${result.projectSlug.toUpperCase()}-${result.taskNumber}`
        : "";
    const url = `${window.location.origin}/dashboard/workspace/${workspaceId}/project/${result.projectId}/task/${result.id}`;
    return {
      id: result.id,
      label: result.title,
      hint: key,
      insert: (editor, position) =>
        editor
          .chain()
          .focus()
          .insertContentAt(position, {
            type: "riunaIssueLink",
            attrs: { url, issueKey: key, taskId: result.id },
          })
          .run(),
    };
  });

  const choose = (result: Result | undefined) => {
    if (!state || !result) return;
    result.insert(state.editor, state.position);
    onClose();
  };

  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state?.kind === "page"
              ? t("wiki:links.pickPage")
              : t("wiki:links.pickTask")}
          </DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-2">
          <Input
            autoFocus
            value={query}
            placeholder={t("wiki:links.search")}
            aria-label={t("wiki:links.search")}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((index) =>
                  Math.min(index + 1, Math.max(results.length - 1, 0)),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(results[selected]);
              }
            }}
          />
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {results.map((result, index) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => choose(result)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                    index === selected && "bg-accent",
                  )}
                >
                  {state?.kind === "page" ? (
                    <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {result.label}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {result.hint}
                  </span>
                </button>
              </li>
            ))}
            {debounced && data && results.length === 0 && (
              <li className="px-2 py-3 text-center text-muted-foreground text-xs">
                {t("wiki:links.empty")}
              </li>
            )}
          </ul>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}

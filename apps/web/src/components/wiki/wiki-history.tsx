import { History, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWikiVersion, useWikiVersions } from "@/hooks/queries/wiki/use-wiki";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import { type DiffLine, diffLines, readableMarkdown } from "@/lib/line-diff";

/** Las lineas de una diferencia, tachadas o en verde como en la maqueta. */
export function DiffView({ lines }: { lines: DiffLine[] }) {
  const { t } = useTranslation();
  const changed = lines.filter((line) => line.kind !== "same");
  if (changed.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("wiki:history.noChanges")}
      </p>
    );
  }
  return (
    <div
      className="overflow-hidden rounded-md border border-border font-mono text-label leading-relaxed"
      data-testid="wiki-diff"
    >
      {changed.map((line, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: las lineas repetidas no tienen otra identidad.
          key={index}
          className={cn(
            "whitespace-pre-wrap px-2 py-0.5",
            line.kind === "added" && "bg-success/12",
            line.kind === "removed" && "bg-destructive/10 line-through",
          )}
        >
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}

/**
 * El historial de una pagina (ADR 092): sus versiones, las diferencias de la
 * elegida con la anterior y, si se puede editar, volver a ella.
 */
export function WikiHistory({
  workspaceId,
  page,
  canEdit,
  restoring,
  onRestore,
}: {
  workspaceId: string;
  page: { id: string; version: number };
  canEdit: boolean;
  restoring: boolean;
  onRestore: (version: number) => void;
}) {
  const { t } = useTranslation();
  const { data: versions = [] } = useWikiVersions(workspaceId, page.id);
  const [selected, setSelected] = useState(page.version);

  // Al guardar, la seleccion sigue a la version nueva.
  useEffect(() => {
    setSelected(page.version);
  }, [page.version]);

  const { data: current } = useWikiVersion(workspaceId, page.id, selected);
  const { data: previous } = useWikiVersion(
    workspaceId,
    page.id,
    selected > 1 ? selected - 1 : null,
  );

  return (
    <aside
      className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3"
      aria-label={t("wiki:history.title")}
    >
      <h2 className="flex items-center gap-1.5 font-medium text-sm">
        <History className="size-4 text-muted-foreground" />
        {t("wiki:history.title")}
      </h2>
      <ol className="space-y-1" data-testid="wiki-versions">
        {versions.map((version) => (
          <li key={version.version}>
            <button
              type="button"
              aria-current={version.version === selected}
              onClick={() => setSelected(version.version)}
              className={cn(
                "w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:bg-accent/60",
                version.version === selected && "border-border bg-card",
              )}
            >
              <span className="font-medium">
                {t("wiki:history.version", { version: version.version })}
              </span>
              <span className="block text-label text-muted-foreground">
                {[
                  version.authorName,
                  formatRelativeTime(version.createdAt),
                  version.restoredFrom
                    ? t("wiki:history.restoredFrom", {
                        version: version.restoredFrom,
                      })
                    : version.note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {current && (
        <div className="space-y-2">
          <h3 className="font-medium text-label uppercase text-muted-foreground">
            {selected > 1
              ? t("wiki:history.diff", { from: selected - 1, to: selected })
              : t("wiki:history.first")}
          </h3>
          {selected > 1 && previous ? (
            <DiffView
              lines={diffLines(
                `${previous.title}\n${readableMarkdown(previous.content)}`,
                `${current.title}\n${readableMarkdown(current.content)}`,
              )}
            />
          ) : null}
          {canEdit && selected < page.version && (
            <Button
              variant="outline"
              size="sm"
              disabled={restoring}
              onClick={() => onRestore(selected)}
            >
              <RotateCcw className="size-3.5" />
              {t("wiki:history.restore", { version: selected })}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}

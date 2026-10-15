import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTaskWikiLinks } from "@/hooks/queries/wiki/use-wiki";

/**
 * Las paginas de la wiki enlazadas con la tarea, en cualquier sentido (ADR
 * 092). Solo sale si hay alguna.
 */
export default function TaskWikiLinks({
  taskId,
  workspaceId,
}: {
  taskId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const { data: links = [] } = useTaskWikiLinks(workspaceId, taskId);
  if (links.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-border/60 p-3"
      data-testid="task-wiki-links"
    >
      <h2 className="flex items-center gap-1.5 text-section">
        <BookOpen className="size-4" />
        {t("wiki:taskLinks.title")}
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <li key={link.pageId}>
            {link.projectId ? (
              <Link
                to="/dashboard/workspace/$workspaceId/project/$projectId/wiki"
                params={{ workspaceId, projectId: link.projectId }}
                search={{ page: link.pageId }}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-sm hover:underline"
              >
                {link.title}
              </Link>
            ) : (
              <Link
                to="/dashboard/workspace/$workspaceId/wiki"
                params={{ workspaceId }}
                search={{ page: link.pageId }}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-sm hover:underline"
              >
                {link.title}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

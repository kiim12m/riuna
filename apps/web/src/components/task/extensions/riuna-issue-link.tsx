import { useQuery } from "@tanstack/react-query";
import { mergeAttributes, Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import getProject from "@/fetchers/project/get-project";
import getTask from "@/fetchers/task/get-task";
import { escapeHtml, isValidUrl } from "./url-safety";

function parseTaskRouteFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /\/dashboard\/workspace\/([^/]+)\/project\/([^/]+)\/task\/([^/]+)(?:\/|$)/i,
    );
    if (!match) return null;
    return {
      workspaceId: match[1],
      projectId: match[2],
      taskId: match[3],
    };
  } catch {
    return null;
  }
}

function RiunaIssueLinkView({ node }: NodeViewProps) {
  const { t } = useTranslation();
  const issueKey = String(node.attrs.issueKey || "");
  const taskIdAttr = String(node.attrs.taskId || "");
  const url = String(node.attrs.url || "");
  const taskRoute = parseTaskRouteFromUrl(url);
  const taskId = taskIdAttr || taskRoute?.taskId || "";

  const { data: task } = useQuery({
    queryKey: ["task", taskId, "riuna-issue-link"],
    queryFn: () => getTask(taskId),
    enabled: Boolean(taskId),
    staleTime: 1000 * 60,
  });
  const { data: project } = useQuery({
    queryKey: [
      "projects",
      taskRoute?.workspaceId,
      taskRoute?.projectId,
      "riuna-issue-link",
    ],
    queryFn: () =>
      getProject({
        id: taskRoute?.projectId ?? "",
        workspaceId: taskRoute?.workspaceId ?? "",
      }),
    enabled: Boolean(taskRoute?.workspaceId && taskRoute?.projectId),
    staleTime: 1000 * 60,
  });

  const projectSlug = project?.slug ? String(project.slug).toUpperCase() : "";
  const resolvedIssueKey =
    issueKey ||
    (projectSlug && task?.number ? `${projectSlug}-${task.number}` : "");
  const title = task?.title || issueKey || t("tasks:entity.task");
  const status = task?.status
    ? t(`tasks:status.${task.status}`)
    : t("tasks:status.to-do");
  const priority = task?.priority
    ? t(`tasks:priority.${task.priority}`)
    : t("tasks:priority.no-priority");
  const assignee = task?.assigneeName || t("tasks:assignee.unassigned");
  const resolvedHref =
    taskRoute?.workspaceId && taskRoute?.projectId && task?.id
      ? `/dashboard/workspace/${taskRoute.workspaceId}/project/${taskRoute.projectId}/task/${task.id}`
      : url;
  const isInternal = resolvedHref.startsWith("/");
  const href = isInternal || isValidUrl(resolvedHref) ? resolvedHref : "";

  return (
    <NodeViewWrapper as="span" className="riuna-issue-link-node">
      <HoverCard openDelay={160} closeDelay={120}>
        <HoverCardTrigger asChild>
          <a
            href={href || undefined}
            target={isInternal ? undefined : "_blank"}
            rel={isInternal ? undefined : "noopener noreferrer"}
            className="riuna-issue-link-chip"
          >
            {resolvedIssueKey ? (
              <span className="riuna-issue-link-key">{resolvedIssueKey}</span>
            ) : null}
            <span className="riuna-issue-link-title">{title}</span>
          </a>
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          sideOffset={8}
          className="riuna-issue-link-preview"
        >
          <div className="riuna-issue-link-preview-top">
            <span className="riuna-issue-link-preview-key">
              {resolvedIssueKey || t("tasks:entity.task")}
            </span>
            <span className="riuna-issue-link-preview-assignee">
              {assignee}
            </span>
          </div>
          <p className="riuna-issue-link-preview-title">{title}</p>
          <div className="riuna-issue-link-preview-meta">
            <span>{status}</span>
            <span>·</span>
            <span>{priority}</span>
          </div>
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}

export const RiunaIssueLink = Node.create({
  name: "riunaIssueLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      url: { default: "" },
      issueKey: { default: "" },
      taskId: { default: "" },
    };
  },

  parseHTML() {
    return [
      { tag: "riuna-issue-link[url]" },
      { tag: "span[data-type='riuna-issue-link'][data-url]" },
      // Descriptions/comments written before the Kaneo->Riuna rename still
      // contain the old tag name; keep parsing it so old content renders.
      { tag: "kaneo-issue-link[url]" },
      { tag: "span[data-type='kaneo-issue-link'][data-url]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "riuna-issue-link",
      mergeAttributes(HTMLAttributes, {
        "data-type": "riuna-issue-link",
        "data-url": HTMLAttributes.url,
        "data-issue-key": HTMLAttributes.issueKey,
        "data-task-id": HTMLAttributes.taskId,
        url: HTMLAttributes.url,
        "issue-key": HTMLAttributes.issueKey,
        "task-id": HTMLAttributes.taskId,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RiunaIssueLinkView);
  },

  renderMarkdown(
    node: { attrs?: { url?: string; issueKey?: string; taskId?: string } },
    _helpers: unknown,
    _context: unknown,
  ) {
    const url = String(node.attrs?.url || "");
    const issueKey = String(node.attrs?.issueKey || "");
    const taskId = String(node.attrs?.taskId || "");
    if (!url) return "";
    return `\n<riuna-issue-link url="${escapeHtml(url)}" issue-key="${escapeHtml(issueKey)}" task-id="${escapeHtml(taskId)}" />\n`;
  },
});

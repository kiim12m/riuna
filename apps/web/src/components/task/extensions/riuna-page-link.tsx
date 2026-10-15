import { mergeAttributes, Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { BookOpen } from "lucide-react";
import { escapeHtml } from "./url-safety";

/** A donde lleva una pagina de la wiki: la de su proyecto o la del espacio. */
export function wikiPageHref(page: {
  id: string;
  workspaceId: string;
  projectId: string | null;
}) {
  const base = `/dashboard/workspace/${page.workspaceId}`;
  return page.projectId
    ? `${base}/project/${page.projectId}/wiki?page=${page.id}`
    : `${base}/wiki?page=${page.id}`;
}

function RiunaPageLinkView({ node }: NodeViewProps) {
  const url = String(node.attrs.url || "");
  const title = String(node.attrs.title || "");
  // Solo rutas internas: una URL ajena no se cuela como enlace de pagina.
  const href = url.startsWith("/dashboard/") ? url : undefined;

  return (
    <NodeViewWrapper as="span" className="riuna-issue-link-node">
      <a href={href} className="riuna-issue-link-chip">
        <BookOpen className="size-3 shrink-0" aria-hidden />
        <span className="riuna-issue-link-title">{title}</span>
      </a>
    </NodeViewWrapper>
  );
}

/**
 * La ficha de una pagina de la wiki dentro de un texto (ADR 092): en una
 * pagina enlaza otra, y en la descripcion de una tarea enlaza la pagina, que
 * la anota en `wiki_link` y la ensena como «Enlazada desde». Va y vuelve por
 * Markdown como `<riuna-page-link page-id title url></riuna-page-link>`.
 */
export const RiunaPageLink = Node.create({
  name: "riunaPageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      pageId: {
        default: "",
        parseHTML: (el) =>
          el.getAttribute("page-id") || el.getAttribute("data-page-id") || "",
      },
      title: {
        default: "",
        parseHTML: (el) =>
          el.getAttribute("title") || el.getAttribute("data-title") || "",
      },
      url: {
        default: "",
        parseHTML: (el) =>
          el.getAttribute("url") || el.getAttribute("data-url") || "",
      },
    };
  },

  parseHTML() {
    return [
      { tag: "riuna-page-link[page-id]" },
      { tag: "span[data-type='riuna-page-link']" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "riuna-page-link",
      mergeAttributes(HTMLAttributes, {
        "data-type": "riuna-page-link",
        "page-id": HTMLAttributes.pageId,
        title: HTMLAttributes.title,
        url: HTMLAttributes.url,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RiunaPageLinkView);
  },

  renderMarkdown(node: {
    attrs?: { pageId?: string; title?: string; url?: string };
  }) {
    const pageId = String(node.attrs?.pageId || "");
    if (!pageId) return "";
    // Con cierre, como las menciones: un elemento propio autocerrado no se
    // cierra al leerlo como HTML y se tragaria lo que le sigue.
    return `<riuna-page-link page-id="${escapeHtml(pageId)}" title="${escapeHtml(String(node.attrs?.title || ""))}" url="${escapeHtml(String(node.attrs?.url || ""))}"></riuna-page-link>`;
  },
});

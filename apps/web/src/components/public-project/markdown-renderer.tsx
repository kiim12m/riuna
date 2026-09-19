import CommentEditor from "@/components/activity/comment-editor";

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <CommentEditor
      value={content}
      readOnly
      showBubbleMenu={false}
      proseClassName="riuna-tiptap-prose"
      contentClassName="riuna-tiptap-content"
      className="[&_.riuna-tiptap-content_.ProseMirror]:max-h-none [&_.riuna-tiptap-content_.ProseMirror]:overflow-visible [&_.riuna-tiptap-content_.ProseMirror]:px-0 [&_.riuna-tiptap-content_.ProseMirror]:py-0"
    />
  );
}

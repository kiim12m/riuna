import { Badge } from "@/components/ui/badge";
import labelColors from "@/constants/label-colors";
import type Task from "@/types/task";

function isValidHtmlColor(color: string): boolean {
  const s = new Option().style;
  s.color = color;
  return s.color !== "";
}

function validColor(value: string): string {
  const mapped = labelColors.find((c) => c.value === value)?.color;
  if (mapped) {
    return mapped;
  }

  if (isValidHtmlColor(value)) {
    return value;
  }

  return "var(--color-neutral-400)";
}

export function TaskLabels({
  labels,
}: {
  labels: NonNullable<Task["labels"]>;
}) {
  if (!labels.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label: { id: string; name: string; color: string }) => (
        <Badge
          key={label.id}
          variant="outline"
          className="px-2 py-0.5 text-[10px] flex items-center"
        >
          <span
            className="inline-block w-1.5 h-1.5 mr-1 rounded-full"
            style={{
              backgroundColor: validColor(label.color),
            }}
          />
          <span className="max-w-20 truncate">{label.name}</span>
        </Badge>
      ))}
    </div>
  );
}

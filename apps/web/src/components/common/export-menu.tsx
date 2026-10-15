import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

export type ExportMenuFormat = "pdf" | "xlsx" | "csv";

const ICONS = { pdf: FileText, xlsx: FileSpreadsheet, csv: Download };

/**
 * El menu «Exportar» de una vista, del parte de horas o de la cartera (ADR
 * 091): cada formato que se ofrezca, con su espera y su error. Quien lo usa
 * pone solo la descarga.
 */
export function ExportMenu({
  formats,
  onExport,
  disabled = false,
  className,
  testId = "export-menu",
}: {
  formats: ExportMenuFormat[];
  onExport: (format: ExportMenuFormat) => Promise<void>;
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<ExportMenuFormat | null>(null);

  const run = async (format: ExportMenuFormat) => {
    setPending(format);
    try {
      await onExport(format);
    } catch (error) {
      toast.error(t("tasks:export.failed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || pending !== null}
        data-testid={testId}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-accent/50 disabled:opacity-60",
          className,
        )}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        {t("tasks:export.label")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((format) => {
          const Icon = ICONS[format];
          return (
            <DropdownMenuItem
              key={format}
              onClick={() => run(format)}
              className="h-8 text-sm"
            >
              <Icon className="size-4" />
              {t(`tasks:export.${format}`)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

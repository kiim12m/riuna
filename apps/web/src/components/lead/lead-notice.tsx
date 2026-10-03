import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMyLeads } from "@/hooks/queries/lead/use-leads";
import { cn } from "@/lib/cn";

/**
 * La transparencia del responsable de departamento (ADR 059): quien tiene
 * responsable lo ve en Hoy y en el Planificador, con lo que ve y lo que no.
 */
export function LeadNotice({
  workspaceId,
  className,
}: {
  workspaceId: string;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const { data: leads } = useMyLeads(workspaceId);

  if (!leads || leads.length === 0) return null;

  const names = new Intl.ListFormat(i18n.language, {
    type: "conjunction",
  }).format(leads.map((lead) => lead.name));

  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-meta text-muted-foreground",
        className,
      )}
      data-testid="lead-notice"
    >
      <Eye className="size-3.5 shrink-0" />
      {t("lead:notice", { count: leads.length, names })}
    </p>
  );
}

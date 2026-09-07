import { Copy, LayoutTemplate, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplyTemplate,
  useCaptureProjectTemplate,
  useDeleteTemplate,
  useGetTemplates,
} from "@/hooks/queries/template/use-templates";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { toast } from "@/lib/toast";

/**
 * Las plantillas viven en el espacio de trabajo, asi que este panel enseña
 * todas y deja aplicar cualquiera **a este** proyecto. Es lo que las hace
 * plantillas y no copias: se guardan una vez y se despliegan donde haga falta.
 */
export default function TemplatePanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id ?? "";
  const { data: templates = [], isPending } = useGetTemplates(workspaceId);
  const captureProject = useCaptureProjectTemplate(workspaceId);
  const applyTemplate = useApplyTemplate(workspaceId);
  const deleteTemplate = useDeleteTemplate(workspaceId);
  const [name, setName] = useState("");

  // Solo se espera cuando hay algo que esperar. Sin espacio resuelto la
  // consulta esta desactivada y `isPending` se queda en `true` para siempre:
  // el panel mostraria un esqueleto eterno en vez de dejar guardar el proyecto,
  // que es lo unico que no necesita el id del espacio.
  if (workspaceId && isPending) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  return (
    <div className="space-y-4">
      {templates.length > 0 && (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{template.name}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {t("settings:projectTemplates.taskCount", {
                    count: template.taskCount,
                  })}
                </p>
              </div>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {t(`settings:projectTemplates.kind.${template.kind}`)}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  applyTemplate.mutate(
                    { templateId: template.id, projectId },
                    {
                      onSuccess: (result) =>
                        toast.success(
                          t("settings:projectTemplates.applied", {
                            count: (result as { createdTaskCount: number })
                              .createdTaskCount,
                          }),
                        ),
                      onError: (error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : t("settings:projectTemplates.applyError"),
                        ),
                    },
                  )
                }
              >
                <Copy className="h-4 w-4" />
                {t("settings:projectTemplates.apply")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("common:actions.delete")}
                onClick={() => deleteTemplate.mutate(template.id)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border border-dashed p-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("settings:projectTemplates.namePlaceholder")}
            aria-label={t("settings:projectTemplates.name")}
          />
        </div>
        <Button
          size="sm"
          disabled={!name.trim() || captureProject.isPending}
          onClick={() =>
            captureProject.mutate(
              { projectId, name: name.trim() },
              { onSuccess: () => setName("") },
            )
          }
        >
          {t("settings:projectTemplates.saveProject")}
        </Button>
      </div>
    </div>
  );
}

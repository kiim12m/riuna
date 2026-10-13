import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUpdateProjectTreeSettings } from "@/hooks/mutations/project/use-update-project-tree-settings";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { toast } from "@/lib/toast";

type TreeSettingsProps = {
  projectId: string;
};

const DEPTH_OPTIONS = [2, 3, 4, 5, 6, 8, 10];

export default function TreeSettings({ projectId }: TreeSettingsProps) {
  const { t } = useTranslation();
  // Se lee del endpoint de tareas y no del de proyecto: aquel no pide el
  // espacio de trabajo, que en esta pantalla no esta en la ruta.
  const { data: project } = useGetTasks(projectId);
  const { mutateAsync: save, isPending } =
    useUpdateProjectTreeSettings(projectId);

  const apply = async (
    settings: Parameters<typeof save>[0],
    errorKey: string,
  ) => {
    try {
      await save(settings);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(errorKey));
    }
  };

  if (!project) return null;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">
            {t("settings:projectTree.cascadeCloseLabel")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings:projectTree.cascadeCloseHint")}
          </p>
        </div>
        <Switch
          checked={project.cascadeClose}
          disabled={isPending}
          onCheckedChange={(checked: boolean) =>
            apply({ cascadeClose: checked }, "settings:projectTree.updateError")
          }
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">
            {t("settings:projectTree.cascadeArchiveLabel")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings:projectTree.cascadeArchiveHint")}
          </p>
        </div>
        <Switch
          checked={project.cascadeArchive}
          disabled={isPending}
          onCheckedChange={(checked: boolean) =>
            apply(
              { cascadeArchive: checked },
              "settings:projectTree.updateError",
            )
          }
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">
            {t("settings:projectTree.weightedProgressLabel")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings:projectTree.weightedProgressHint")}
          </p>
        </div>
        <Switch
          checked={Boolean(project.weightedProgress)}
          disabled={isPending}
          data-testid="weighted-progress"
          onCheckedChange={(checked: boolean) =>
            apply(
              { weightedProgress: checked },
              "settings:projectTree.updateError",
            )
          }
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">
            {t("settings:projectTree.depthLabel")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings:projectTree.depthHint")}
          </p>
        </div>
        <Select
          value={String(project.maxTaskDepth)}
          onValueChange={(value: string | null) => {
            if (!value) return;
            apply(
              { maxTaskDepth: Number(value) },
              "settings:projectTree.updateError",
            );
          }}
        >
          <SelectTrigger className="w-24">
            <SelectValue>{project.maxTaskDepth}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DEPTH_OPTIONS.map((depth) => (
              <SelectItem key={depth} value={String(depth)}>
                {depth}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

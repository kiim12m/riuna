import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateProjectParent } from "@/hooks/mutations/project/use-update-project-parent";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { toast } from "@/lib/toast";

const NO_PARENT = "__none";

/**
 * «Subproyecto de» (ADR 089): un solo nivel, asi que solo se ofrecen los
 * proyectos que no son ya subproyecto de otro, y uno con subproyectos no puede
 * colgar de nadie.
 */
export default function ProjectParentSetting({
  projectId,
  workspaceId,
  canEdit,
}: {
  projectId: string;
  workspaceId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { data: projects = [] } = useGetProjects({ workspaceId });
  const { mutate, isPending } = useUpdateProjectParent(workspaceId);
  const project = projects.find((entry) => entry.id === projectId);
  const hasChildren = projects.some((entry) => entry.parentId === projectId);
  const candidates = projects.filter(
    (entry) => entry.id !== projectId && !entry.parentId,
  );
  const value = project?.parentId ?? NO_PARENT;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="space-y-0.5">
        <p className="font-medium text-sm">
          {t("settings:projectGeneral.parentLabel")}
        </p>
        <p className="text-muted-foreground text-xs">
          {hasChildren
            ? t("settings:projectGeneral.parentHasChildren")
            : t("settings:projectGeneral.parentHint")}
        </p>
      </div>
      <Select
        value={value}
        disabled={!canEdit || hasChildren || isPending}
        onValueChange={(next) =>
          mutate(
            {
              projectId,
              parentId: next === NO_PARENT ? null : String(next),
            },
            {
              onSuccess: () =>
                toast.success(t("settings:projectGeneral.parentSaved")),
              onError: (error) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : t("settings:projectGeneral.parentError"),
                ),
            },
          )
        }
      >
        <SelectTrigger
          className="w-full sm:w-64"
          aria-label={t("settings:projectGeneral.parentLabel")}
          data-testid="project-parent"
        >
          <SelectValue>
            {value === NO_PARENT
              ? t("settings:projectGeneral.noParent")
              : (projects.find((entry) => entry.id === value)?.name ?? "")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PARENT}>
            {t("settings:projectGeneral.noParent")}
          </SelectItem>
          {candidates.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

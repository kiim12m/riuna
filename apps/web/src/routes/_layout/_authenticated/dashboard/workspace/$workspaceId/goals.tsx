import { createFileRoute } from "@tanstack/react-router";
import { Plus, Target } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { GoalCard } from "@/components/goal/goal-card";
import { GoalDialog, TargetDialog } from "@/components/goal/goal-dialogs";
import PageTitle from "@/components/page-title";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { Goal, GoalTarget } from "@/fetchers/goal";
import {
  useCreateGoal,
  useCreateTarget,
  useDeleteGoal,
  useDeleteTarget,
  useGetGoals,
  useUpdateGoal,
  useUpdateTarget,
} from "@/hooks/queries/goal/use-goals";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/goals",
)({
  component: GoalsComponent,
});

function GoalsComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data: goals, isPending } = useGetGoals(workspaceId);

  const createGoal = useCreateGoal(workspaceId);
  const updateGoal = useUpdateGoal(workspaceId);
  const deleteGoal = useDeleteGoal(workspaceId);
  const createTarget = useCreateTarget(workspaceId);
  const updateTarget = useUpdateTarget(workspaceId);
  const deleteTarget = useDeleteTarget(workspaceId);

  const [goalDialog, setGoalDialog] = useState<{ goal: Goal | null } | null>(
    null,
  );
  const [targetDialog, setTargetDialog] = useState<{
    goalId: string;
    target: GoalTarget | null;
  } | null>(null);

  const { user } = useAuth();
  const { canModerateShared } = useWorkspacePermission();

  // La regla de la API (`require-goal-owner.ts`): lo toca quien lo creo, y un
  // compartido tambien quien modera el espacio. Ensenar las acciones a
  // cualquier otro solo le daba un 403 sin explicacion.
  const canEdit = (goal: Goal) =>
    goal.createdBy === user?.id ||
    (Boolean(goal.isShared) && canModerateShared());

  const onError = (error: unknown) =>
    toast.error(
      error instanceof Error ? error.message : t("goals:errors.saveFailed"),
    );

  return (
    <>
      <PageTitle title={t("goals:pageTitle")} />
      <WorkspaceLayout
        title={t("goals:pageTitle")}
        headerActions={
          <Button
            variant="outline"
            size="xs"
            className="gap-1"
            onClick={() => setGoalDialog({ goal: null })}
          >
            <Plus className="size-3" />
            {t("goals:actions.create")}
          </Button>
        }
      >
        <div className="p-4">
          {isPending ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {["a", "b"].map((key) => (
                <Skeleton key={key} className="h-48 w-full rounded-lg" />
              ))}
            </div>
          ) : !goals || goals.length === 0 ? (
            <Empty className="min-h-[50vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Target />
                </EmptyMedia>
                <EmptyTitle>{t("goals:empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("goals:empty.description")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setGoalDialog({ goal: null })}>
                  <Plus />
                  {t("goals:actions.create")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  {...(canEdit(goal)
                    ? {
                        onEdit: () => setGoalDialog({ goal }),
                        onDelete: () => deleteGoal.mutate(goal.id, { onError }),
                        onToggleShare: () =>
                          updateGoal.mutate(
                            { id: goal.id, isShared: !goal.isShared },
                            { onError },
                          ),
                        onAddTarget: () =>
                          setTargetDialog({ goalId: goal.id, target: null }),
                        onEditTarget: (target: GoalTarget) =>
                          setTargetDialog({ goalId: goal.id, target }),
                        onDeleteTarget: (target: GoalTarget) =>
                          deleteTarget.mutate(target.id, { onError }),
                      }
                    : {})}
                />
              ))}
            </div>
          )}
        </div>
      </WorkspaceLayout>

      {goalDialog && (
        <GoalDialog
          open
          goal={goalDialog.goal}
          isPending={createGoal.isPending || updateGoal.isPending}
          onClose={() => setGoalDialog(null)}
          // Se cierra cuando el servidor acepta, no al enviar: si lo rechaza, lo
          // escrito sigue en el dialogo y el error se ve.
          onSubmit={(values) => {
            const handlers = { onSuccess: () => setGoalDialog(null), onError };
            if (goalDialog.goal) {
              updateGoal.mutate(
                { id: goalDialog.goal.id, ...values },
                handlers,
              );
            } else {
              createGoal.mutate({ workspaceId, ...values }, handlers);
            }
          }}
        />
      )}

      {targetDialog && (
        <TargetDialog
          open
          target={targetDialog.target}
          isPending={createTarget.isPending || updateTarget.isPending}
          onClose={() => setTargetDialog(null)}
          onSubmit={(values) => {
            const handlers = {
              onSuccess: () => setTargetDialog(null),
              onError,
            };
            if (targetDialog.target) {
              updateTarget.mutate(
                { id: targetDialog.target.id, ...values },
                handlers,
              );
            } else {
              createTarget.mutate(
                { goalId: targetDialog.goalId, ...values },
                handlers,
              );
            }
          }}
        />
      )}
    </>
  );
}

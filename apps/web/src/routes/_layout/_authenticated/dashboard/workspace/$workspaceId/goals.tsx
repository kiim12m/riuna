import { createFileRoute } from "@tanstack/react-router";
import { Plus, Target } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { GoalCard } from "@/components/goal/goal-card";
import { GoalDialog, TargetDialog } from "@/components/goal/goal-dialogs";
import PageTitle from "@/components/page-title";
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
                  onEdit={() => setGoalDialog({ goal })}
                  onDelete={() => deleteGoal.mutate(goal.id)}
                  onToggleShare={() =>
                    updateGoal.mutate({
                      id: goal.id,
                      isShared: !goal.isShared,
                    })
                  }
                  onAddTarget={() =>
                    setTargetDialog({ goalId: goal.id, target: null })
                  }
                  onEditTarget={(target) =>
                    setTargetDialog({ goalId: goal.id, target })
                  }
                  onDeleteTarget={(target) => deleteTarget.mutate(target.id)}
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
          onSubmit={(values) => {
            if (goalDialog.goal) {
              updateGoal.mutate({ id: goalDialog.goal.id, ...values });
            } else {
              createGoal.mutate({ workspaceId, ...values });
            }
            setGoalDialog(null);
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
            if (targetDialog.target) {
              updateTarget.mutate({ id: targetDialog.target.id, ...values });
            } else {
              createTarget.mutate({ goalId: targetDialog.goalId, ...values });
            }
            setTargetDialog(null);
          }}
        />
      )}
    </>
  );
}

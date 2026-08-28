import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import TableView from "@/components/table-view";
import type { AddFieldPayload } from "@/components/table-view/add-field-dialog";
import AddFieldDialog from "@/components/table-view/add-field-dialog";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  useCreateFieldDefinition,
  useUpdateTaskCustomFields,
} from "@/hooks/mutations/field/use-field-mutations";
import useGetFieldDefinitions from "@/hooks/queries/field/use-get-field-definitions";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TableSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/table",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): TableSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();

  const { data: project } = useGetTasks(projectId);
  const { data: definitions = [] } = useGetFieldDefinitions(projectId);
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);

  const { mutate: setCustomField } = useUpdateTaskCustomFields(projectId);
  const { mutate: createField, isPending: isCreatingField } =
    useCreateFieldDefinition(projectId);

  // Rellenar un valor es `task:update`; definir un campo de proyecto es
  // `project:update`, que hoy solo tienen admin y owner. Por eso son dos
  // capacidades distintas y no una.
  const { canUpdateTasks, canUpdateProjects } = useWorkspacePermission();
  const canEditValues = canUpdateTasks();
  const canDefineFields = canUpdateProjects();

  // La tabla trabaja sobre una lista plana y reconstruye el arbol por su
  // cuenta; el proyecto llega repartido en columnas.
  const tasks = useMemo<Task[]>(() => {
    if (!project) return [];

    return [
      ...(project.columns ?? []).flatMap((column) => column.tasks ?? []),
      ...(project.plannedTasks ?? []),
    ];
  }, [project]);

  // Los campos de tipo `usuario` eligen de aqui. Se aplanan a lo minimo que la
  // celda necesita para no acoplarla a la forma de la respuesta.
  const members = useMemo(
    () =>
      (workspaceUsers?.members ?? []).map((member) => ({
        id: member.userId,
        name: member.user?.name ?? "",
        image: member.user?.image ?? null,
      })),
    [workspaceUsers],
  );

  const handleOpenTask = useCallback(
    (id: string) => {
      navigate({ to: ".", search: { taskId: id }, replace: true });
    },
    [navigate],
  );

  const handleCloseTaskSheet = useCallback(() => {
    navigate({ to: ".", search: {}, replace: true });
  }, [navigate]);

  const handleSetCustomField = useCallback(
    (id: string, key: string, value: unknown) => {
      setCustomField(
        { taskId: id, values: { [key]: value } },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : t("tasks:table.saveFailed"),
            );
          },
        },
      );
    },
    [setCustomField, t],
  );

  const handleCreateField = useCallback(
    (field: AddFieldPayload) => {
      createField(field, {
        onSuccess: () => {
          setIsAddFieldOpen(false);
          toast.success(t("tasks:table.fieldCreated"));
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : t("tasks:table.fieldCreateFailed"),
          );
        },
      });
    },
    [createField, t],
  );

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="table"
    >
      <PageTitle title={t("tasks:table.pageTitle", { name: project?.name })} />
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        <TableView
          tasks={tasks}
          definitions={definitions as FieldDefinition[]}
          members={members}
          canEdit={canEditValues}
          onOpenTask={handleOpenTask}
          onSetCustomField={handleSetCustomField}
          onAddField={
            canDefineFields ? () => setIsAddFieldOpen(true) : undefined
          }
        />
      </div>

      <AddFieldDialog
        open={isAddFieldOpen}
        pending={isCreatingField}
        onClose={() => setIsAddFieldOpen(false)}
        onCreate={handleCreateField}
      />

      <TaskDetailsSheet
        taskId={taskId}
        projectId={projectId}
        workspaceId={workspaceId}
        onClose={handleCloseTaskSheet}
      />
    </ProjectLayout>
  );
}

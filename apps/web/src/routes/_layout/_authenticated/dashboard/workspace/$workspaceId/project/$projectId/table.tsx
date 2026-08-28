import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import TableView from "@/components/table-view";
import type { AddFieldPayload } from "@/components/table-view/add-field-dialog";
import AddFieldDialog from "@/components/table-view/add-field-dialog";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import FilterBar from "@/components/table-view/filter-bar";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  useCreateFieldDefinition,
  useUpdateTaskCustomFields,
} from "@/hooks/mutations/field/use-field-mutations";
import useGetFieldDefinitions from "@/hooks/queries/field/use-get-field-definitions";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import {
  buildFilter,
  type EditableCondition,
  type FilterableField,
  type FilterValueType,
} from "@/types/task-filter";

type TableSearchParams = {
  taskId?: string;
  /**
   * Las condiciones del filtro. Van como array y no como cadena JSON porque
   * TanStack Router serializa y parsea la busqueda con `JSON.parse`: una
   * cadena que parezca JSON llega ya convertida, y comprobar `typeof
   * === "string"` la descartaba en silencio.
   */
  filter?: EditableCondition[];
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/table",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): TableSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    filter: Array.isArray(search.filter)
      ? (search.filter as EditableCondition[])
      : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId, filter: filterParam } = Route.useSearch();
  const navigate = useNavigate();

  // Las condiciones viven en la URL y no en estado local: un tablero filtrado
  // tiene que poder pegarse en un mensaje, y es lo que la tabla `view` de esta
  // misma fase acabara guardando.
  const conditions = useMemo<EditableCondition[]>(
    () => filterParam ?? [],
    [filterParam],
  );

  const setConditions = useCallback(
    (next: EditableCondition[]) => {
      navigate({
        to: ".",
        search: (previous: TableSearchParams) => ({
          ...previous,
          filter: next.length > 0 ? next : undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const filter = useMemo(() => buildFilter(conditions), [conditions]);

  const { data: project, error } = useGetTasks(projectId, filter);
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

  // Lo que la barra ofrece: los campos fijos que el motor conoce mas los
  // personalizados del proyecto. Los de tipo relacion se quedan fuera porque
  // su valor no vive en el JSONB y el motor no los registra.
  const filterableFields = useMemo<FilterableField[]>(() => {
    const customTypes: Record<string, FilterValueType | undefined> = {
      text: "text",
      number: "number",
      currency: "number",
      select: "id",
      multi_select: "id",
      date: "date",
      checkbox: "boolean",
      user: "id",
      url: "text",
    };

    const builtIn: FilterableField[] = [
      {
        key: "title",
        label: t("tasks:table.columns.title"),
        valueType: "text",
      },
      {
        key: "status",
        label: t("tasks:table.columns.status"),
        valueType: "id",
      },
      {
        key: "priority",
        label: t("tasks:table.columns.priority"),
        valueType: "id",
        options: ["urgent", "high", "medium", "low"].map((value) => ({
          value,
          label: getPriorityLabel(value),
        })),
      },
      {
        key: "dueDate",
        label: t("tasks:table.columns.dueDate"),
        valueType: "date",
      },
      {
        key: "assignee",
        label: t("tasks:table.columns.assignee"),
        valueType: "id",
        options: members.map((member) => ({
          value: member.id,
          label: member.name,
        })),
      },
    ];

    const custom = (definitions as FieldDefinition[]).flatMap((definition) => {
      const valueType = customTypes[definition.type];
      if (!valueType) return [];

      const options = Array.isArray(definition.config?.options)
        ? (definition.config.options as Array<{
            value: string;
            label: string;
          }>)
        : undefined;

      return [
        {
          key: `custom.${definition.key}`,
          label: definition.name,
          valueType,
          options,
        },
      ];
    });

    return [...builtIn, ...custom];
  }, [definitions, members, t]);

  // Abrir y cerrar una tarea conserva el resto de la busqueda. Escribir
  // `search: {}` borraria el filtro, asi que pinchar una fila te dejaria sin
  // el filtro que la habia encontrado.
  const handleOpenTask = useCallback(
    (id: string) => {
      navigate({
        to: ".",
        search: (previous: TableSearchParams) => ({
          ...previous,
          taskId: id,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleCloseTaskSheet = useCallback(() => {
    navigate({
      to: ".",
      search: (previous: TableSearchParams) => ({
        ...previous,
        taskId: undefined,
      }),
      replace: true,
    });
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
        <div className="border-border/80 border-b">
          <FilterBar
            fields={filterableFields}
            conditions={conditions}
            onChange={setConditions}
          />
          {error && (
            <p className="px-3 pb-2 text-destructive text-xs">
              {error instanceof Error
                ? error.message
                : t("tasks:table.filterFailed")}
            </p>
          )}
        </div>
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

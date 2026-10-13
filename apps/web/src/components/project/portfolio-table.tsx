import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import icons from "@/constants/project-icons";
import { cn } from "@/lib/cn";
import { formatDateMedium } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import CustomFieldCell, {
  type FieldDefinition,
  type FieldMember,
} from "../table-view/custom-field-cell";
import { type PortfolioProject, parseSort } from "./portfolio";
import { ProjectHealthChip, ProjectScheduleWarning } from "./project-health";

export type PortfolioRow = PortfolioProject & {
  icon?: string | null;
  healthNote?: string | null;
  schedule?: { tasksDueDate: string; overflowWorkDays: number } | null;
};

function SortableRow({
  id,
  canReorder,
  onClick,
  children,
}: {
  id: string;
  canReorder: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const {
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id,
    disabled: !canReorder,
    // El reordenado ya mueve la fila; animar el cambio de indice repetiria el
    // movimiento desde un desplazamiento viejo.
    animateLayoutChanges: () => false,
    transition: { duration: 200, easing: "var(--ease-out)" },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isSorting ? transition : undefined,
  };

  return (
    // `listeners` sin `attributes`: estos ponen role="button" y una parada de
    // tabulador en la fila.
    <TableRow
      ref={setNodeRef}
      style={style}
      data-riuna-sortable=""
      className={cn(
        "group/row cursor-pointer",
        isDragging && "relative z-10 bg-muted shadow-md",
      )}
      onClick={onClick}
      {...(canReorder ? listeners : {})}
    >
      {children}
    </TableRow>
  );
}

/**
 * La tabla de la cartera (ADR 088): una fila por proyecto, las columnas que se
 * eligieron, ordenable por cabecera y, sin filtro ni orden, reordenable
 * arrastrando. Los campos de proyecto se editan en la propia celda.
 */
export default function PortfolioTable({
  projects,
  workspaceId,
  visibleColumns,
  definitions,
  members,
  sort,
  canEdit,
  canReorder,
  onSort,
  onReorder,
  onOpen,
  onSetField,
}: {
  projects: PortfolioRow[];
  workspaceId: string;
  visibleColumns: ReadonlySet<string>;
  definitions: FieldDefinition[];
  members: FieldMember[];
  sort: string | undefined;
  canEdit: boolean;
  canReorder: boolean;
  onSort: (columnId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onOpen: (projectId: string) => void;
  onSetField: (projectId: string, key: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );
  const memberById = new Map(members.map((member) => [member.id, member]));
  const parsedSort = parseSort(sort);
  const shown = (id: string) => visibleColumns.has(id);
  const fields = definitions.filter((definition) =>
    shown(`custom.${definition.key}`),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    document.body.classList.remove("riuna-dragging");
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  const header = (id: string, label: string, className?: string) =>
    shown(id) && (
      <TableHead
        key={id}
        className={cn("font-medium text-foreground", className)}
      >
        <button
          type="button"
          onClick={() => onSort(id)}
          className="flex items-center gap-1 hover:text-foreground"
        >
          {label}
          {parsedSort?.id === id && (parsedSort.desc ? "↓" : "↑")}
        </button>
      </TableHead>
    );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={() => document.body.classList.add("riuna-dragging")}
      onDragEnd={handleDragEnd}
      onDragCancel={() => document.body.classList.remove("riuna-dragging")}
    >
      <Table data-testid="portfolio-table">
        <TableHeader>
          <TableRow>
            {header("title", t("workspace:projects.columns.title"))}
            {header("health", t("workspace:projects.columns.health"))}
            {header("lead", t("workspace:projects.columns.lead"))}
            {header("startDate", t("workspace:projects.columns.startDate"))}
            {header("endDate", t("workspace:projects.columns.endDate"))}
            {header("progress", t("workspace:projects.columns.progress"))}
            {header(
              "tasks",
              t("workspace:projects.columns.tasks"),
              "text-right",
            )}
            {fields.map((definition) =>
              header(`custom.${definition.key}`, definition.name),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableContext
            items={projects.map((project) => project.id)}
            strategy={verticalListSortingStrategy}
          >
            {projects.map((project) => {
              const Icon =
                icons[project.icon as keyof typeof icons] || icons.Layout;
              const lead = project.leadUserId
                ? memberById.get(project.leadUserId)
                : undefined;
              const values = project.customFields ?? {};
              return (
                <SortableRow
                  key={project.id}
                  id={project.id}
                  canReorder={canReorder}
                  onClick={() => onOpen(project.id)}
                >
                  {shown("title") && (
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <Icon className="size-5 text-muted-foreground" />
                        <span className="font-medium">{project.name}</span>
                      </div>
                    </TableCell>
                  )}
                  {shown("health") && (
                    <TableCell className="py-3">
                      <ProjectHealthChip
                        project={project}
                        workspaceId={workspaceId}
                        canEdit={canEdit}
                      />
                    </TableCell>
                  )}
                  {shown("lead") && (
                    <TableCell className="py-3">
                      {lead ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          <Avatar className="size-5">
                            <AvatarImage src={lead.image ?? ""} alt="" />
                            <AvatarFallback className="text-label">
                              {getInitials(lead.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{lead.name}</span>
                        </span>
                      ) : null}
                    </TableCell>
                  )}
                  {shown("startDate") && (
                    <TableCell className="py-3 text-muted-foreground text-sm">
                      {project.startDate
                        ? formatDateMedium(project.startDate)
                        : ""}
                    </TableCell>
                  )}
                  {shown("endDate") && (
                    <TableCell className="py-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                        {project.endDate
                          ? formatDateMedium(project.endDate)
                          : ""}
                        <ProjectScheduleWarning schedule={project.schedule} />
                      </span>
                    </TableCell>
                  )}
                  {shown("progress") && (
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={project.statistics.completionPercentage}
                          className="h-2 w-16"
                        />
                        <span className="text-muted-foreground text-sm">
                          {project.statistics.completionPercentage}%
                        </span>
                      </div>
                    </TableCell>
                  )}
                  {shown("tasks") && (
                    <TableCell className="py-3 text-right text-muted-foreground text-sm tabular-nums">
                      {project.statistics.totalTasks}
                    </TableCell>
                  )}
                  {fields.map((definition) => (
                    <TableCell
                      key={definition.key}
                      className="py-2"
                      // La celda se edita en su sitio: ni abre el proyecto ni
                      // empieza un arrastre.
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <CustomFieldCell
                        definition={definition}
                        value={values[definition.key]}
                        members={members}
                        disabled={!canEdit}
                        onCommit={(value) =>
                          onSetField(project.id, definition.key, value)
                        }
                      />
                    </TableCell>
                  ))}
                </SortableRow>
              );
            })}
          </SortableContext>
        </TableBody>
      </Table>
    </DndContext>
  );
}

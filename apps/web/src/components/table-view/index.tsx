import {
  createColumnHelper,
  createExpandedRowModel,
  createSortedRowModel,
  rowExpandingFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import type Task from "@/types/task";
import CustomFieldCell, {
  type FieldDefinition,
  type FieldMember,
} from "./custom-field-cell";

// Una fila de la tabla es una tarea mas sus hijas, que TanStack Table sabe
// plegar por su cuenta: es la razon por la que el plan eligio esta libreria
// —sub-filas nativas— sobre escribir el arbol a mano por tercera vez.
export type TableRow = Task & { subRows: TableRow[] };

// En la v9 las funcionalidades se declaran: sin registrarlas, ni la ordenacion
// ni el plegado existen en la tabla. Va a nivel de modulo porque no cambia.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
});

const helper = createColumnHelper<typeof features, TableRow>();

// Un array nuevo en cada render invalidaria los modelos que dependen de los
// datos, asi que el vacio es una constante.
const EMPTY_ROWS: TableRow[] = [];

type Props = {
  tasks: Task[];
  definitions: FieldDefinition[];
  members: FieldMember[];
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
  onSetCustomField: (taskId: string, key: string, value: unknown) => void;
  onAddField?: () => void;
};

/**
 * Reconstruye el arbol desde la lista plana. El servidor manda `parentId` ya
 * calculado, asi que esto es un agrupado y no un recorrido recursivo.
 *
 * Una tarea cuyo padre no este en la lista —porque un filtro lo dejo fuera— se
 * trata como raiz, para que no desaparezca de la vista con el.
 */
function buildRows(tasks: Task[]): TableRow[] {
  const byId = new Map<string, TableRow>();

  for (const task of tasks) {
    byId.set(task.id, { ...task, subRows: [] });
  }

  const roots: TableRow[] = [];

  for (const row of byId.values()) {
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) {
      parent.subRows.push(row);
    } else {
      roots.push(row);
    }
  }

  const sortByPosition = (rows: TableRow[]) => {
    rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const row of rows) sortByPosition(row.subRows);
  };

  sortByPosition(roots);

  return roots;
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function TableView({
  tasks,
  definitions,
  members,
  canEdit,
  onOpenTask,
  onSetCustomField,
  onAddField,
}: Props) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);

  const data = useMemo(() => {
    const rows = buildRows(tasks);
    return rows.length > 0 ? rows : EMPTY_ROWS;
  }, [tasks]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("title", {
          id: "title",
          header: t("tasks:table.columns.title"),
          cell: ({ row }) => (
            <div
              className="flex items-center gap-1"
              // La sangria dice de que rama cuelga la fila. Va en el estilo y
              // no en clases porque la profundidad es un dato.
              style={{ paddingLeft: `${row.depth * 16}px` }}
            >
              {row.getCanExpand() ? (
                <button
                  type="button"
                  onClick={row.getToggleExpandedHandler()}
                  className="rounded p-0.5 hover:bg-accent"
                  aria-label={
                    row.getIsExpanded()
                      ? t("tasks:table.collapse")
                      : t("tasks:table.expand")
                  }
                >
                  {row.getIsExpanded() ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-4.5" />
              )}
              <button
                type="button"
                onClick={() => onOpenTask(row.original.id)}
                className="truncate text-left text-xs hover:underline"
              >
                {row.original.title}
              </button>
              {row.original.subRows.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {row.original.subRows.length}
                </span>
              )}
            </div>
          ),
        }),
        helper.accessor("status", {
          id: "status",
          header: t("tasks:table.columns.status"),
          cell: ({ getValue }) => (
            <span className="text-xs">{String(getValue() ?? "")}</span>
          ),
        }),
        helper.accessor("priority", {
          id: "priority",
          header: t("tasks:table.columns.priority"),
          cell: ({ getValue }) => {
            const priority = getValue();
            if (!priority) return null;
            return (
              <span className="flex items-center gap-1 text-xs">
                {getPriorityIcon(priority)}
                {getPriorityLabel(priority)}
              </span>
            );
          },
        }),
        helper.accessor((row) => row.assigneeName ?? "", {
          id: "assignee",
          header: t("tasks:table.columns.assignee"),
          cell: ({ row }) =>
            row.original.assigneeName ? (
              <span className="flex items-center gap-1.5 text-xs">
                <Avatar className="size-5">
                  <AvatarImage src={row.original.assigneeImage ?? ""} alt="" />
                  <AvatarFallback className="text-[9px]">
                    {getInitials(row.original.assigneeName)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{row.original.assigneeName}</span>
              </span>
            ) : null,
        }),
        helper.accessor((row) => row.dueDate ?? "", {
          id: "dueDate",
          header: t("tasks:table.columns.dueDate"),
          cell: ({ row }) => (
            <span className="text-xs">{formatDate(row.original.dueDate)}</span>
          ),
        }),
        ...definitions.map((definition) =>
          helper.accessor(
            // Ordenar por el valor guardado y no por lo que se ve: lo que se ve
            // lleva formato de moneda o etiquetas de opciones.
            (row) => (row.customFields?.[definition.key] ?? null) as string,
            {
              id: `custom.${definition.key}`,
              header: definition.name,
              cell: ({ row }) => (
                <CustomFieldCell
                  definition={definition}
                  value={row.original.customFields?.[definition.key]}
                  members={members}
                  disabled={!canEdit}
                  onCommit={(value) =>
                    onSetCustomField(row.original.id, definition.key, value)
                  }
                />
              ),
            },
          ),
        ),
      ]),
    [definitions, members, canEdit, onOpenTask, onSetCustomField, t],
  );

  const table = useTable({
    features,
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    // El plegado lo lleva la tabla por dentro. En la v9 `state.expanded` no
    // siembra el atomo que lee `getIsExpanded`; `initialState` si, y con
    // `true` arranca con el arbol entero desplegado. Pasarlo por `state` deja
    // todas las ramas cerradas aunque el valor diga lo contrario.
    initialState: { expanded: true },
    getSubRows: (row) => row.subRows,
  });

  const showAddField = Boolean(onAddField) && canEdit;

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-border/80 border-b">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground text-xs"
                >
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    <table.FlexRender header={header} />
                    {header.column.getIsSorted() === "asc" && "↑"}
                    {header.column.getIsSorted() === "desc" && "↓"}
                  </button>
                </th>
              ))}
              {showAddField && (
                <th className="w-10 px-2 py-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={onAddField}
                    aria-label={t("tasks:table.addField")}
                    title={t("tasks:table.addField")}
                    className="h-6 w-6 p-0"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </th>
              )}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-border/50 border-b hover:bg-accent/30"
            >
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-3 py-1.5 align-middle">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
              {showAddField && <td />}
            </tr>
          ))}
        </tbody>
      </table>

      {data.length === 0 && (
        <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
          {t("tasks:table.empty")}
        </div>
      )}
    </div>
  );
}

export default TableView;

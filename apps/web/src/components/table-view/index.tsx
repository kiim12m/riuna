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
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/duration";
import { resolveEpicColor } from "@/lib/epic-color";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import type Task from "@/types/task";
import CustomFieldCell, {
  type FieldDefinition,
  type FieldMember,
  formatForDisplay,
} from "./custom-field-cell";
import {
  buildRows,
  type EpicGroup,
  groupByEpic,
  rowIdOf,
  type TableRow,
} from "./rows";

export type { TableRow };

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
  /** Las columnas del proyecto, para poder resolver `status` a su nombre. */
  columns: { slug: string; name: string }[];
  /** Pinta cada tarea como fila propia, sin anidar bajo su padre. */
  flatten?: boolean;
  /**
   * Las columnas que se ven, por id. Sin dato, todas las que ofrece la tabla
   * (la vista de siempre); el padre las resuelve con `resolveVisibleColumns`.
   */
  visibleColumns?: ReadonlySet<string>;
  /** Reparte las filas de primer nivel en grupos (hoy, por epica). */
  groupBy?: "epic";
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
  onSetCustomField: (taskId: string, key: string, value: unknown) => void;
  onAddField?: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

type TableColumns = ReturnType<typeof helper.columns>;

/**
 * Un grupo de la tabla: su cabecera y sus filas. Cada grupo lleva su propia
 * tabla —las mismas columnas y el mismo orden— porque una sola ordenaria las
 * filas de todos los grupos juntas y los mezclaria.
 */
function GroupRows({
  group,
  columns,
  sorting,
  colSpan,
  showAddField,
  collapsed,
  onToggle,
  noEpicLabel,
}: {
  group: EpicGroup;
  columns: TableColumns;
  sorting: SortingState;
  colSpan: number;
  showAddField: boolean;
  collapsed: boolean;
  onToggle: () => void;
  noEpicLabel: string;
}) {
  const table = useTable({
    features,
    data: group.rows,
    columns,
    state: { sorting },
    initialState: { expanded: true },
    getSubRows: (row) => row.subRows,
    getRowId: rowIdOf,
  });

  return (
    <Fragment>
      <tr className="border-border/60 border-b bg-muted/40">
        <td colSpan={colSpan + (showAddField ? 1 : 0)} className="px-3 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            data-testid={`group-${group.key}`}
            className="flex items-center gap-2 font-medium text-xs"
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            <span
              className="size-2.5 rounded-full border border-border"
              style={{
                backgroundColor: group.epic
                  ? resolveEpicColor(group.epic.color)
                  : "transparent",
              }}
            />
            {group.epic?.name ?? noEpicLabel}
            <span className="text-meta text-muted-foreground">
              {group.rows.length}
            </span>
          </button>
        </td>
      </tr>
      {!collapsed &&
        table.getRowModel().rows.map((row) => (
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
    </Fragment>
  );
}

function TableView({
  tasks,
  definitions,
  members,
  // `columns` ya nombra aqui la definicion de las columnas de la tabla, que es
  // otra cosa que las columnas del tablero.
  columns: projectColumns,
  flatten = false,
  visibleColumns,
  groupBy,
  canEdit,
  onOpenTask,
  onSetCustomField,
  onAddField,
}: Props) {
  const { t, i18n } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);

  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const rows = useMemo(() => {
    // Aplanar es cosa de la vista, no de la consulta: son las mismas tareas,
    // pintadas como filas hermanas en vez de anidadas.
    return flatten
      ? tasks.map((task) => ({ ...task, subRows: [] as TableRow[] }))
      : buildRows(tasks);
  }, [tasks, flatten]);

  const groups = useMemo<EpicGroup[] | null>(
    () => (groupBy === "epic" ? groupByEpic(rows) : null),
    [rows, groupBy],
  );

  // La tabla principal lleva todas las filas: su cabecera es la que ordena. En
  // grupos, el cuerpo lo pintan tablas hermanas (una por grupo) que comparten
  // columnas y orden, de modo que ordenar no mezcla los grupos.
  const data = useMemo(() => {
    const all = groups ? groups.flatMap((group) => group.rows) : rows;
    return all.length > 0 ? all : EMPTY_ROWS;
  }, [groups, rows]);

  const columnNames = useMemo(
    () => new Map(projectColumns.map((column) => [column.slug, column.name])),
    [projectColumns],
  );

  const columns = useMemo(() => {
    const all = helper.columns([
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
              <span className="text-meta text-muted-foreground">
                {row.original.subRows.length}
              </span>
            )}
          </div>
        ),
      }),
      helper.accessor("status", {
        id: "status",
        header: t("tasks:table.columns.status"),
        // `status` guarda el **slug** de la columna, no su nombre. Pintarlo
        // crudo dejaba `to-do` e `in-progress` en una tabla donde la celda de
        // prioridad de al lado si resuelve icono y etiqueta. Si la columna ya
        // no existe —se archivo— se cae al slug antes que dejar la celda
        // vacia: un dato feo dice mas que ninguno.
        cell: ({ getValue }) => {
          const slug = String(getValue() ?? "");
          if (!slug) return null;

          return (
            <span className="text-meta">{columnNames.get(slug) ?? slug}</span>
          );
        },
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
                <AvatarFallback className="text-label">
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
      // Los agregados del arbol, ordenables como cualquier columna. Resumen de
      // la **rama**: una hoja se resume a si misma cuando tiene dato propio, y
      // si no, queda vacia.
      helper.accessor((row) => row.subtree?.progress, {
        sortUndefined: "last",
        id: "agg.progress",
        header: t("tasks:table.aggregates.progress"),
        cell: ({ row }) =>
          row.original.subtree ? (
            <span className="flex items-center gap-2 text-xs tabular-nums">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${row.original.subtree.progress}%` }}
                />
              </span>
              {row.original.subtree.progress}%
            </span>
          ) : null,
      }),
      helper.accessor((row) => row.subtree?.descendantCount, {
        sortUndefined: "last",
        id: "agg.descendants",
        header: t("tasks:table.aggregates.descendants"),
        cell: ({ row }) =>
          row.original.subtree ? (
            <span className="text-xs tabular-nums">
              {row.original.subtree.descendantDoneCount}/
              {row.original.subtree.descendantCount}
            </span>
          ) : null,
      }),
      helper.accessor(
        (row) => row.subtree?.estimateSeconds ?? row.estimate ?? undefined,
        {
          sortUndefined: "last",
          id: "agg.estimate",
          header: t("tasks:table.aggregates.estimate"),
          cell: ({ row }) => {
            const seconds =
              row.original.subtree?.estimateSeconds ?? row.original.estimate;
            return seconds ? (
              <span className="text-xs tabular-nums">
                {formatDuration(seconds, i18n.language)}
              </span>
            ) : null;
          },
        },
      ),
      ...definitions
        .filter(
          (definition) =>
            definition.type === "number" || definition.type === "currency",
        )
        .map((definition) => {
          const sumOf = (row: TableRow) => {
            const summed = row.subtree?.fieldSums?.[definition.key];
            if (summed !== undefined) return summed;
            const own = row.customFields?.[definition.key];
            return typeof own === "number" ? own : undefined;
          };

          // Sin valor va al final en los dos sentidos: un -1 de relleno se
          // mezclaba con las sumas negativas de un campo de moneda.
          return helper.accessor((row) => sumOf(row), {
            sortUndefined: "last",
            id: `agg.sum.${definition.key}`,
            header: t("tasks:table.aggregates.sum", {
              name: definition.name,
            }),
            cell: ({ row }) => {
              const total = sumOf(row.original);
              return total === undefined ? null : (
                <span className="text-xs tabular-nums">
                  {formatForDisplay(definition, total)}
                </span>
              );
            },
          });
        }),
    ]);

    return visibleColumns
      ? all.filter((column) => visibleColumns.has(String(column.id)))
      : all;
  }, [
    visibleColumns,
    i18n.language,
    definitions,
    members,
    canEdit,
    onOpenTask,
    onSetCustomField,
    columnNames,
    t,
  ]);

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
    // La fila se identifica por la tarea, no por su posicion. Con la posicion,
    // si una actualizacion en vivo reordenaba las filas mientras se editaba una
    // celda, el borrador se quedaba en ese hueco y se guardaba en otra tarea.
    getRowId: rowIdOf,
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
          {groups
            ? groups.map((group) => (
                <GroupRows
                  key={group.key}
                  group={group}
                  columns={columns}
                  sorting={sorting}
                  colSpan={columns.length}
                  showAddField={showAddField}
                  collapsed={collapsedGroups.has(group.key)}
                  onToggle={() =>
                    setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  noEpicLabel={t("tasks:table.noEpic")}
                />
              ))
            : table.getRowModel().rows.map((row) => (
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

import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import FieldHelp from "@/components/field/field-help";
import AddFieldDialog, {
  type AddFieldPayload,
  type FieldPatch,
} from "@/components/table-view/add-field-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  useCreateFieldDefinition,
  useDeleteFieldDefinition,
  useUpdateFieldDefinition,
} from "@/hooks/mutations/field/use-field-definition-mutations";
import {
  useGetFieldDefinitions,
  useGetWorkspaceFieldDefinitions,
} from "@/hooks/queries/field/use-get-field-definitions";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type Definition = {
  id: string;
  key: string;
  name: string;
  type: string;
  projectId: string | null;
  position: number;
  required: boolean;
  archivedAt: string | Date | null;
  description: string | null;
  config: Record<string, unknown>;
};

/**
 * El editor de campos personalizados: crear, renombrar, ordenar, archivar y
 * borrar. Hasta ahora solo se creaban desde el «+» de la tabla, y lo demas
 * existia en la API y no en la interfaz.
 *
 * Con `projectId` edita los campos de **ese proyecto** (y enseña, sin tocarlos,
 * los del espacio, que se editan en los ajustes del espacio). Sin el, edita los
 * del espacio. Su tipo y su clave no cambian nunca (ADR 013): la clave es con la
 * que cada tarea guarda su valor.
 */
export default function FieldEditor({
  projectId,
  workspaceId,
  canEdit = true,
  entity = "task",
}: {
  projectId?: string;
  workspaceId: string;
  canEdit?: boolean;
  /** `project`: los campos de los proyectos del espacio (ADR 088). */
  entity?: "task" | "project";
}) {
  const { t } = useTranslation();
  const projectQuery = useGetFieldDefinitions(projectId ?? "", {
    includeArchived: true,
  });
  const workspaceQuery = useGetWorkspaceFieldDefinitions(
    projectId ? "" : workspaceId,
    { includeArchived: true, entity },
  );
  const definitions = (
    (projectId ? projectQuery.data : workspaceQuery.data) ?? []
  ).map((definition) => definition as unknown as Definition);
  const isLoading = projectId
    ? projectQuery.isLoading
    : workspaceQuery.isLoading;

  const { mutateAsync: create, isPending: isCreating } =
    useCreateFieldDefinition({ projectId, workspaceId, entity });
  const { mutateAsync: update } = useUpdateFieldDefinition();
  const { mutateAsync: remove } = useDeleteFieldDefinition();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Definition | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Definition | null>(null);

  // Los del espacio, en el editor de un proyecto, se ven y no se tocan.
  const editable = (definition: Definition) =>
    canEdit && (projectId ? definition.projectId === projectId : true);

  const ordered = [...definitions].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  );

  const fail = (error: unknown, fallbackKey: string) =>
    toast.error(error instanceof Error ? error.message : t(fallbackKey));

  const handleCreate = async (field: AddFieldPayload) => {
    try {
      await create(field);
      setAdding(false);
      toast.success(t("tasks:table.fieldCreated"));
    } catch (error) {
      fail(error, "tasks:table.fieldCreateFailed");
    }
  };

  // Nombre, ayuda y, en un calculado, su formula (ADR 090). El dialogo sigue
  // abierto si la API rechaza la formula, para corregirla sin reescribirla.
  const save = async (patch: FieldPatch) => {
    if (!editing) return;
    setSaving(true);
    try {
      await update({ id: editing.id, ...patch });
      setEditing(null);
    } catch (error) {
      fail(error, "settings:projectFields.updateError");
    } finally {
      setSaving(false);
    }
  };

  // Lo que una formula puede leer: los campos vigentes del mismo alcance. Un
  // campo de proyecto (ADR 088) no se calcula.
  const formulaFields =
    entity === "task"
      ? definitions.filter((definition) => !definition.archivedAt)
      : undefined;

  const setArchived = async (definition: Definition, archived: boolean) => {
    try {
      await update({ id: definition.id, archived });
    } catch (error) {
      fail(error, "settings:projectFields.updateError");
    }
  };

  // Solo se reordenan los que se pueden editar: en el editor de un proyecto, los
  // del espacio llevan su propia numeracion y no se tocan, asi que contar con
  // ellos al intercambiar dejaba la flecha sin efecto. Se renumeran todos los
  // editables (desde 1, como al crearlos): si varios compartian posicion,
  // intercambiar solo dos no fijaria un orden.
  const movable = ordered.filter(editable);

  const move = async (definition: Definition, direction: -1 | 1) => {
    const index = movable.findIndex((entry) => entry.id === definition.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= movable.length) return;

    const next = [...movable];
    [next[index], next[target]] = [
      next[target] as Definition,
      next[index] as Definition,
    ];

    try {
      await Promise.all(
        next.flatMap((entry, position) =>
          entry.position === position + 1
            ? []
            : [update({ id: entry.id, position: position + 1 })],
        ),
      );
    } catch (error) {
      fail(error, "settings:projectFields.updateError");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await remove(target.id);
    } catch (error) {
      fail(error, "settings:projectFields.deleteError");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            {/* En los ajustes del espacio conviven los dos editores: cada
                boton dice cual es el suyo. */}
            {entity === "project"
              ? t("settings:workspaceFields.addProjectField")
              : t("tasks:table.addField")}
          </Button>
        </div>
      )}

      {!isLoading && ordered.length === 0 && (
        <p className="py-4 text-center text-muted-foreground text-xs">
          {t("settings:projectFields.empty")}
        </p>
      )}

      <ul className="divide-y divide-border/60" data-testid="field-list">
        {ordered.map((definition) => {
          const archived = Boolean(definition.archivedAt);
          const mine = editable(definition);

          return (
            <li
              key={definition.id}
              className={cn(
                "flex items-center gap-2 py-2",
                archived && "opacity-60",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="block truncate text-sm">
                  {definition.name}
                </span>
                <FieldHelp definition={definition} fields={definitions} />
              </div>

              <span className="shrink-0 text-muted-foreground text-xs">
                {t(`tasks:table.fieldTypes.${definition.type}`, {
                  defaultValue: definition.type,
                })}
              </span>
              {projectId && !definition.projectId && (
                <span className="shrink-0 rounded border border-border px-1.5 text-label text-muted-foreground">
                  {t("settings:projectFields.workspaceBadge")}
                </span>
              )}
              {archived && (
                <span className="shrink-0 rounded border border-border px-1.5 text-label text-muted-foreground">
                  {t("settings:projectFields.archivedBadge")}
                </span>
              )}

              {mine && (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={t("settings:projectFields.moveUp")}
                    disabled={movable[0]?.id === definition.id}
                    onClick={() => move(definition, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={t("settings:projectFields.moveDown")}
                    disabled={movable.at(-1)?.id === definition.id}
                    onClick={() => move(definition, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={t("settings:projectFields.editAction")}
                    onClick={() => setEditing(definition)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={
                      archived
                        ? t("settings:projectFields.unarchiveAction")
                        : t("settings:projectFields.archiveAction")
                    }
                    onClick={() => setArchived(definition, !archived)}
                  >
                    {archived ? (
                      <ArchiveRestore className="size-3.5" />
                    ) : (
                      <Archive className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive"
                    aria-label={t("settings:projectFields.deleteAction")}
                    onClick={() => setDeleting(definition)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <AddFieldDialog
        open={adding}
        pending={isCreating}
        onClose={() => setAdding(false)}
        onCreate={handleCreate}
        formulaFields={formulaFields}
      />

      <AddFieldDialog
        open={editing !== null}
        pending={saving}
        editing={editing}
        onClose={() => setEditing(null)}
        onUpdate={save}
        formulaFields={formulaFields}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings:projectFields.deleteTitle", {
                name: deleting?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings:projectFields.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("settings:projectFields.deleteAction")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

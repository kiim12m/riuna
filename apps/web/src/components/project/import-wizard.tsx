import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useAnalyzeImport from "@/hooks/mutations/task/use-analyze-import";
import useImportTasks, {
  type ImportColumnMapping,
} from "@/hooks/mutations/task/use-import-tasks";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

// Asistente de importacion: elegir fichero, confirmar el mapeo, comprobar y
// aplicar.
//
// El fichero se sube dos veces —analizar e importar— a proposito: guardarlo en
// el servidor entre los dos pasos seria estado que caducar y que no sobrevive a
// una segunda instancia de la API. Aqui vive en el estado del componente, asi
// que quien importa lo elige una sola vez.

/** Los campos reservados que se pueden elegir en el desplegable de una columna. */
const EXCHANGE_FIELDS = [
  "id",
  "reference",
  "outline",
  "title",
  "description",
  "descriptionHtml",
  "status",
  "priority",
  "assignee",
  "assignees",
  "team",
  "epics",
  "labels",
  "startDate",
  "dueDate",
  "estimateHours",
] as const;

/** `relation` queda fuera: su valor son filas de `task_relation`, no JSONB. */
const FIELD_TYPES = [
  "text",
  "number",
  "currency",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "user",
  "url",
] as const;

type Analysis = Awaited<
  ReturnType<ReturnType<typeof useAnalyzeImport>["mutateAsync"]>
>;
type Report = Awaited<
  ReturnType<ReturnType<typeof useImportTasks>["mutateAsync"]>
>;

type ColumnChoice = {
  /** `ignore`, un campo reservado, o `custom:<clave>`. */
  target: string;
  /** Tipo confirmado cuando la columna va a crear un campo nuevo. */
  type: string;
};

type ImportWizardProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImportWizard({
  projectId,
  open,
  onOpenChange,
}: ImportWizardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [choices, setChoices] = useState<Record<number, ColumnChoice>>({});
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<Report | null>(null);

  const { mutateAsync: analyze, isPending: isAnalyzing } = useAnalyzeImport();
  const { mutateAsync: runImport, isPending: isImporting } = useImportTasks();

  const reset = () => {
    setFile(null);
    setAnalysis(null);
    setChoices({});
    setSource("");
    setPreview(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const chooseFile = async (chosen: File) => {
    try {
      const result = await analyze({ projectId, file: chosen });

      setFile(chosen);
      setAnalysis(result);
      setSource(result.source);
      setPreview(null);
      setChoices(
        Object.fromEntries(
          result.columns.map((column) => [
            column.index,
            {
              target:
                column.kind === "field"
                  ? (column.field ?? "ignore")
                  : column.kind === "custom"
                    ? `custom:${column.key}`
                    : "ignore",
              type: column.existingFieldKey
                ? ""
                : (column.inferredType ?? "text"),
            },
          ]),
        ),
      );
    } catch (error) {
      toast.error(t("settings:tasksImportExport.analyzeError"), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const buildMapping = (): ImportColumnMapping[] => {
    if (!analysis) return [];

    return analysis.columns.map((column) => {
      const choice = choices[column.index];
      const target = choice?.target ?? "ignore";

      if (target === "ignore") {
        return { index: column.index, target: { kind: "ignore" } };
      }

      if (target.startsWith("custom:")) {
        const key = target.slice("custom:".length);
        return {
          index: column.index,
          target: {
            kind: "custom",
            key,
            // Solo se pide crear la definicion si no existe ya. `type` y `key`
            // son inmutables (ADR 013), asi que el tipo va confirmado a mano.
            ...(column.existingFieldKey
              ? {}
              : {
                  create: {
                    name: column.header,
                    type: choice?.type ?? "text",
                    ...(column.inferredOptions
                      ? { options: column.inferredOptions }
                      : {}),
                  },
                }),
          },
        };
      }

      return { index: column.index, target: { kind: "field", field: target } };
    });
  };

  const submit = async (dryRun: boolean) => {
    if (!file) return;

    try {
      const report = await runImport({
        projectId,
        file,
        mapping: buildMapping(),
        source,
        dryRun,
      });

      if (dryRun) {
        setPreview(report);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });

      toast.success(
        t("settings:tasksImportExport.importSuccess", {
          created: report.results.created,
          updated: report.results.updated,
        }),
      );

      if (report.results.failed > 0) {
        const firstError = report.results.rows.find(
          (row) => row.outcome === "failed",
        );

        toast.error(
          t("settings:tasksImportExport.importPartialError", {
            count: report.results.failed,
          }),
          firstError && "error" in firstError
            ? { description: firstError.error }
            : undefined,
        );
      }

      close();
    } catch (error) {
      toast.error(t("settings:tasksImportExport.importError"), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogPopup className="w-full max-w-3xl">
        <div className="bg-card rounded-lg shadow-xl border border-border">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <DialogTitle className="text-section text-foreground">
              {t("settings:tasksImportExport.dialogTitle")}
            </DialogTitle>
          </div>

          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {!analysis ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("settings:tasksImportExport.dialogDescription")}
                </p>

                {/** biome-ignore lint/a11y/noStaticElementInteractions: onDrop y onDragOver no llevan rol */}
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center",
                    "border-border hover:border-ring bg-muted/60 transition-colors",
                  )}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dropped = event.dataTransfer.files[0];
                    if (dropped) chooseFile(dropped);
                    else
                      toast.error(
                        t("settings:tasksImportExport.noFileDropped"),
                      );
                  }}
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {t("settings:tasksImportExport.dropHint")}
                    </p>
                    <Button
                      className="mt-2"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileUp className="h-4 w-4" />
                      )}
                      {t("settings:tasksImportExport.selectFile")}
                    </Button>
                    {/* El boton abre este campo. Sin el, importar solo se podia
                        arrastrando, y con el teclado no se podia. */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={(event) => {
                        const chosen = event.target.files?.[0];
                        // Se limpia para que elegir el mismo fichero otra vez
                        // vuelva a disparar el cambio.
                        event.target.value = "";
                        if (chosen) chooseFile(chosen);
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <Summary analysis={analysis} preview={preview} />

                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    {t("settings:tasksImportExport.sourceLabel")}
                  </span>
                  <Input
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings:tasksImportExport.sourceHint")}
                  </p>
                </div>

                <div className="border border-border rounded-md divide-y divide-border">
                  {analysis.columns.map((column) => (
                    <div
                      key={column.index}
                      className="grid grid-cols-[1fr_auto_auto] gap-2 items-center p-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {column.header ||
                            t("settings:tasksImportExport.unnamedColumn")}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {column.samples.join(" · ")}
                        </p>
                      </div>

                      <Select
                        value={choices[column.index]?.target ?? "ignore"}
                        onValueChange={(value: string | null) => {
                          if (!value) return;
                          setChoices((current) => ({
                            ...current,
                            [column.index]: {
                              target: value,
                              type: current[column.index]?.type ?? "text",
                            },
                          }));
                          setPreview(null);
                        }}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue>
                            {targetLabel(
                              t,
                              choices[column.index]?.target ?? "ignore",
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">
                            {t("settings:tasksImportExport.targetIgnore")}
                          </SelectItem>
                          {EXCHANGE_FIELDS.map((field) => (
                            <SelectItem key={field} value={field}>
                              {t(`settings:tasksImportExport.field.${field}`)}
                            </SelectItem>
                          ))}
                          {column.key ? (
                            <SelectItem value={`custom:${column.key}`}>
                              {t("settings:tasksImportExport.targetCustom")}
                            </SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>

                      {isNewField(column, choices[column.index]) ? (
                        <Select
                          value={choices[column.index]?.type ?? "text"}
                          onValueChange={(value: string | null) => {
                            if (!value) return;
                            setChoices((current) => ({
                              ...current,
                              [column.index]: {
                                target:
                                  current[column.index]?.target ?? "ignore",
                                type: value,
                              },
                            }));
                            setPreview(null);
                          }}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue>
                              {t(
                                `settings:tasksImportExport.type.${choices[column.index]?.type ?? "text"}`,
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {t(`settings:tasksImportExport.type.${type}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground w-36">
                          {column.existingFieldKey
                            ? t("settings:tasksImportExport.existingField")
                            : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <DialogClose render={<Button variant="outline" />}>
              {t("common:actions.cancel")}
            </DialogClose>

            {analysis ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => submit(true)}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("settings:tasksImportExport.check")}
                </Button>
                <Button onClick={() => submit(false)} disabled={isImporting}>
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("settings:tasksImportExport.importTasks")}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function isNewField(
  column: Analysis["columns"][number],
  choice: ColumnChoice | undefined,
): boolean {
  return (
    !column.existingFieldKey && Boolean(choice?.target.startsWith("custom:"))
  );
}

function targetLabel(t: (key: string) => string, target: string): string {
  if (target === "ignore") return t("settings:tasksImportExport.targetIgnore");
  if (target.startsWith("custom:"))
    return t("settings:tasksImportExport.targetCustom");
  return t(`settings:tasksImportExport.field.${target}`);
}

function Summary({
  analysis,
  preview,
}: {
  analysis: Analysis;
  preview: Report | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {t("settings:tasksImportExport.summary", {
          rows: analysis.rowCount,
          matched:
            analysis.identity.matchedById +
            analysis.identity.matchedByReference,
          fresh: analysis.identity.new,
        })}
      </p>

      {analysis.outline.present ? (
        <p className="text-sm text-muted-foreground">
          {t("settings:tasksImportExport.outlineSummary", {
            roots: analysis.outline.roots,
            depth: analysis.outline.maxDepth + 1,
          })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("settings:tasksImportExport.noOutline")}
        </p>
      )}

      {analysis.outline.issues.length > 0 ? (
        <div className="flex gap-2 items-start text-sm text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {t("settings:tasksImportExport.outlineIssues", {
              count: analysis.outline.issues.length,
            })}
          </span>
        </div>
      ) : null}

      {preview ? (
        <p className="text-sm font-medium">
          {t("settings:tasksImportExport.checkResult", {
            created: preview.results.created,
            updated: preview.results.updated,
            failed: preview.results.failed,
          })}
        </p>
      ) : null}
    </div>
  );
}

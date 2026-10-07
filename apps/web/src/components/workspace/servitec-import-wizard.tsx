import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionSelect } from "@/components/automation/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  analyzeServitecImport,
  importServitecSheet,
  type ServitecAnalysis,
  type ServitecChoice,
  type ServitecReport,
} from "@/fetchers/task/servitec-import";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { toast } from "@/lib/toast";

const choiceValue = (choice: ServitecChoice) =>
  choice.action === "map" ? `map:${choice.projectId}` : choice.action;

const choiceFrom = (value: string): ServitecChoice =>
  value.startsWith("map:")
    ? { action: "map", projectId: value.slice(4) }
    : { action: value === "skip" ? "skip" : "create" };

function ReportView({ report }: { report: ServitecReport }) {
  const { t } = useTranslation();
  const r = (key: string, options?: Record<string, unknown>) =>
    t(`settings:servitecImport.report.${key}`, options);
  return (
    <div
      className="space-y-2 rounded-md border border-border p-3 text-sm"
      data-testid="servitec-report"
    >
      <p className="font-medium">
        {r(report.dryRun ? "checkTitle" : "doneTitle")}
      </p>
      <ul className="space-y-0.5 text-muted-foreground">
        <li>{r("created", { count: report.created })}</li>
        <li>{r("updated", { count: report.updated })}</li>
        {report.skipped > 0 && (
          <li>{r("skipped", { count: report.skipped })}</li>
        )}
        <li>
          {r("comments", {
            added: report.commentsAdded,
            kept: report.commentsKept,
          })}
        </li>
        {report.projects
          .filter((project) => project.pending > 0)
          .map((project) => (
            <li key={project.name}>
              {r("pending", { count: project.pending, name: project.name })}
            </li>
          ))}
      </ul>
      {report.failures.length > 0 && (
        <ul className="space-y-0.5 text-destructive-foreground text-xs">
          {report.failures.slice(0, 10).map((failure) => (
            <li key={failure.row}>
              {r("failure", { row: failure.row, error: failure.error })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Subir la hoja de SERVITEC (ADR 069): el cuadro que se llevaba a mano o una
 * exportacion editada en Excel. Cada PROYECTO que no existe se resuelve aqui:
 * crearlo, llevar sus filas a otro, o descartarlas.
 */
export function ServitecImportWizard({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const s = (key: string, options?: Record<string, unknown>) =>
    t(`settings:servitecImport.${key}`, options);
  const queryClient = useQueryClient();
  const { data: projects = [] } = useGetProjects({ workspaceId });
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ServitecAnalysis | null>(null);
  const [choices, setChoices] = useState<Record<string, ServitecChoice>>({});
  const [report, setReport] = useState<ServitecReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async <T,>(work: () => Promise<T>) => {
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : s("error"));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pick = async (next: File | null) => {
    setFile(next);
    setAnalysis(null);
    setReport(null);
    if (!next) return;
    const result = await run(() => analyzeServitecImport(workspaceId, next));
    if (!result) return;
    setAnalysis(result);
    setChoices(
      Object.fromEntries(
        result.projects
          .filter((project) => !project.projectId)
          .map((project) => [project.name, { action: "create" } as const]),
      ),
    );
  };

  const submit = async (dryRun: boolean) => {
    if (!file) return;
    const result = await run(() =>
      importServitecSheet(workspaceId, file, choices, dryRun),
    );
    if (!result) return;
    setReport(result);
    if (!dryRun) {
      toast.success(s("imported"));
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  };

  const projectOptions = (name: string) => [
    { id: "create", name: s("choice.create", { name }) },
    { id: "skip", name: s("choice.skip") },
    ...(projects as Array<{ id: string; name: string }>).map((project) => ({
      id: `map:${project.id}`,
      name: s("choice.map", { name: project.name }),
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{s("title")}</DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <p className="text-muted-foreground text-sm">{s("hint")}</p>
          <div className="space-y-1.5">
            <Label htmlFor="servitec-file">{s("file")}</Label>
            <Input
              id="servitec-file"
              type="file"
              accept=".xlsx"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
          </div>

          {analysis && (
            <div className="space-y-3" data-testid="servitec-analysis">
              <p className="text-sm">
                {s("summary", {
                  count: analysis.rows,
                  existing: analysis.existing,
                  comments: analysis.comments,
                })}
              </p>
              <ul className="space-y-2">
                {analysis.projects.map((project) =>
                  project.projectId ? (
                    <li key={project.name} className="text-sm">
                      {s("knownProject", {
                        name: project.name,
                        count: project.rows,
                      })}
                    </li>
                  ) : (
                    <li key={project.name} className="space-y-1">
                      <OptionSelect
                        label={s("unknownProject", {
                          name: project.name,
                          count: project.rows,
                        })}
                        value={choiceValue(
                          choices[project.name] ?? { action: "create" },
                        )}
                        options={projectOptions(project.name)}
                        onChange={(value) =>
                          setChoices((current) => ({
                            ...current,
                            [project.name]: choiceFrom(value),
                          }))
                        }
                      />
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          {report && <ReportView report={report} />}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            {s("close")}
          </DialogClose>
          <Button
            variant="outline"
            size="sm"
            disabled={!analysis || busy}
            onClick={() => submit(true)}
          >
            {s("check")}
          </Button>
          <Button
            size="sm"
            disabled={!analysis || busy}
            onClick={() => submit(false)}
          >
            {s("import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

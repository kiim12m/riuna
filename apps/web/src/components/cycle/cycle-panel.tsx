import { Plus, Target } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import type { Cycle } from "@/fetchers/cycle";
import {
  useCloseCycle,
  useCreateCycle,
  useGetCycleReport,
  useGetCycles,
  useGetVelocityHistory,
  useUpdateCycle,
} from "@/hooks/queries/cycle/use-cycles";
import { cn } from "@/lib/cn";
import { CloseCycleDialog } from "./close-cycle-dialog";
import { CreateCycleDialog } from "./create-cycle-dialog";
import type { BurndownUnit } from "./cycle-burndown";
import { CycleBurndown } from "./cycle-burndown";
import { CycleHours } from "./cycle-hours";
import { CycleVelocity } from "./cycle-velocity";

export function CyclePanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unit, setUnit] = useState<BurndownUnit>("tasks");
  const [showCreate, setShowCreate] = useState(false);
  const [closing, setClosing] = useState<Cycle | null>(null);

  const { data: cycles = [], isPending } = useGetCycles(projectId);
  const { data: velocity = [] } = useGetVelocityHistory(projectId);

  // Por defecto se mira el ciclo activo: es el que esta pasando.
  const selected =
    cycles.find((cycle) => cycle.id === selectedId) ??
    cycles.find((cycle) => cycle.status === "active") ??
    cycles[0];

  const { data: report } = useGetCycleReport(selected?.id);

  const createCycle = useCreateCycle(projectId);
  const updateCycle = useUpdateCycle(projectId);
  const closeCycle = useCloseCycle(projectId);

  if (isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (cycles.length === 0) {
    return (
      <div className="p-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Target />
            </EmptyMedia>
            <EmptyTitle>{t("cycles:empty.title")}</EmptyTitle>
            <EmptyDescription>{t("cycles:empty.description")}</EmptyDescription>
          </EmptyHeader>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4" />
            {t("cycles:create.title")}
          </Button>
        </Empty>
        <CreateCycleDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          isPending={createCycle.isPending}
          onCreate={(payload) =>
            createCycle.mutate(payload, {
              onSuccess: () => setShowCreate(false),
            })
          }
        />
      </div>
    );
  }

  const pendingCount = selected
    ? selected.taskCount - selected.doneTaskCount
    : 0;
  const closeCandidates = cycles.filter(
    (cycle) => cycle.id !== selected?.id && cycle.status !== "closed",
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {cycles.map((cycle) => (
            <button
              key={cycle.id}
              type="button"
              onClick={() => setSelectedId(cycle.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1 text-sm transition-colors",
                cycle.id === selected?.id
                  ? "border-border bg-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/60",
              )}
            >
              {cycle.name}
              <Badge
                variant={cycle.status === "active" ? "default" : "outline"}
                className="px-1.5 py-0 text-[10px]"
              >
                {t(`cycles:status.${cycle.status}`)}
              </Badge>
            </button>
          ))}
        </div>

        <div className="ms-auto flex items-center gap-1">
          {/* Conmutar la unidad es lo que evita el doble eje. */}
          <SegmentedControl
            label={t("cycles:unit.label")}
            value={unit}
            onValueChange={setUnit}
            options={(["tasks", "hours"] as BurndownUnit[]).map((option) => ({
              value: option,
              label: t(`cycles:unit.${option}`),
            }))}
          />

          {selected?.status === "planned" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateCycle.mutate({ cycleId: selected.id, status: "active" })
              }
            >
              {t("cycles:actions.start")}
            </Button>
          )}
          {selected?.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setClosing(selected)}
            >
              {t("cycles:actions.close")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selected?.goal && (
        <p className="text-muted-foreground text-sm">{selected.goal}</p>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              label={t("cycles:stats.completed")}
              value={`${report.summary.doneTasks}/${report.summary.totalTasks}`}
            />
            <StatTile
              label={t("cycles:stats.estimated")}
              value={`${Math.round(report.summary.estimateSeconds / 360) / 10} h`}
            />
            <StatTile
              label={t("cycles:stats.velocity")}
              value={
                unit === "tasks"
                  ? String(report.summary.doneTasks)
                  : `${Math.round(report.summary.doneEstimateSeconds / 360) / 10} h`
              }
            />
            <StatTile
              label={t("cycles:stats.logged")}
              value={`${Math.round(report.summary.loggedSeconds / 360) / 10} h`}
            />
          </div>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <h3 className="font-medium text-sm">
              {t("cycles:burndown.title")}
            </h3>
            <CycleBurndown report={report} unit={unit} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="font-medium text-sm">{t("cycles:hours.title")}</h3>
              <CycleHours report={report.hoursByPerson} />
            </section>

            <section className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="font-medium text-sm">
                {t("cycles:velocity.title")}
              </h3>
              {velocity.length > 0 ? (
                <CycleVelocity history={velocity} unit={unit} />
              ) : (
                <p className="py-6 text-center text-muted-foreground text-sm">
                  {t("cycles:velocity.empty")}
                </p>
              )}
            </section>
          </div>
        </>
      )}

      <CreateCycleDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        isPending={createCycle.isPending}
        onCreate={(payload) =>
          createCycle.mutate(payload, { onSuccess: () => setShowCreate(false) })
        }
      />

      {closing && (
        <CloseCycleDialog
          cycle={closing}
          candidates={closeCandidates}
          pendingCount={pendingCount}
          open
          isPending={closeCycle.isPending}
          onClose={() => setClosing(null)}
          onConfirm={(destination) =>
            closeCycle.mutate(
              { cycleId: closing.id, ...destination },
              { onSuccess: () => setClosing(null) },
            )
          }
        />
      )}
    </div>
  );
}

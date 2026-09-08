import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Goal, GoalMetric, GoalTarget } from "@/fetchers/goal";

const METRICS: GoalMetric[] = [
  "doneCount",
  "count",
  "doneRatio",
  "sumEstimate",
];

/** Trimestre en curso, que es el periodo que la fase pide por defecto. */
function currentQuarter() {
  const now = new Date();
  const firstMonth = Math.floor(now.getMonth() / 3) * 3;
  const start = new Date(now.getFullYear(), firstMonth, 1);
  const end = new Date(now.getFullYear(), firstMonth + 3, 0);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export function GoalDialog({
  open,
  goal,
  isPending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  goal?: Goal | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    description: string | null;
    startsAt: string;
    endsAt: string;
  }) => void;
}) {
  const { t } = useTranslation();
  const quarter = currentQuarter();

  const [name, setName] = useState(goal?.name ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [start, setStart] = useState(
    goal ? String(goal.startsAt).slice(0, 10) : quarter.start,
  );
  const [end, setEnd] = useState(
    goal ? String(goal.endsAt).slice(0, 10) : quarter.end,
  );

  const invalid = name.trim().length === 0 || end < start;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {goal ? t("goals:form.editTitle") : t("goals:form.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("goals:form.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">{t("goals:form.name")}</Label>
            <Input
              id="goal-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("goals:form.namePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-description">{t("goals:form.detail")}</Label>
            <Input
              id="goal-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-start">{t("goals:form.startsAt")}</Label>
              <Input
                id="goal-start"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-end">{t("goals:form.endsAt")}</Label>
              <Input
                id="goal-end"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>

          {end < start && (
            <p className="text-destructive text-xs">
              {t("goals:form.datesInvalid")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={invalid || isPending}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                description: description.trim() || null,
                startsAt: start,
                endsAt: end,
              })
            }
          >
            {t("common:actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TargetDialog({
  open,
  target,
  isPending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  target?: GoalTarget | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    targetValue: number;
    config: { metric: GoalMetric; scope?: "assigned" | "team" };
  }) => void;
}) {
  const { t } = useTranslation();
  const existing = (target?.config ?? {}) as {
    metric?: GoalMetric;
    scope?: "assigned" | "team";
  };

  const [name, setName] = useState(target?.name ?? "");
  const [value, setValue] = useState(String(target?.targetValue ?? 10));
  const [metric, setMetric] = useState<GoalMetric>(
    existing.metric ?? "doneCount",
  );
  const [scope, setScope] = useState<"all" | "assigned" | "team">(
    existing.scope ?? "all",
  );

  const parsed = Number.parseInt(value, 10);
  const invalid =
    name.trim().length === 0 || !Number.isFinite(parsed) || parsed < 1;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target
              ? t("goals:target.editTitle")
              : t("goals:target.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("goals:target.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="target-name">{t("goals:target.name")}</Label>
            <Input
              id="target-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("goals:target.namePlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="target-metric">{t("goals:target.metric")}</Label>
              <Select
                value={metric}
                onValueChange={(next) => setMetric(next as GoalMetric)}
              >
                <SelectTrigger id="target-metric">
                  <SelectValue>{t(`panels:metric.${metric}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`panels:metric.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="target-value">{t("goals:target.value")}</Label>
              <Input
                id="target-value"
                type="number"
                min={1}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-scope">{t("goals:target.scope")}</Label>
            <Select
              value={scope}
              onValueChange={(next) =>
                setScope(next as "all" | "assigned" | "team")
              }
            >
              <SelectTrigger id="target-scope">
                <SelectValue>{t(`goals:scope.${scope}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(["all", "assigned", "team"] as const).map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`goals:scope.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={invalid || isPending}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                targetValue: parsed,
                config: {
                  metric,
                  ...(scope !== "all" ? { scope } : {}),
                },
              })
            }
          >
            {t("common:actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

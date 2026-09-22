import { createFileRoute } from "@tanstack/react-router";
import { saveAs } from "file-saver";
import { FileClock } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TimeSheetGroupBy } from "@/fetchers/time-sheet";
import { exportTimeSheet } from "@/fetchers/time-sheet";
import { useTimeSheet } from "@/hooks/queries/time-sheet/use-time-sheet";
import { formatDuration } from "@/lib/duration";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const DEFAULT_RANGE_DAYS = 7;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/time-sheet",
)({
  component: RouteComponent,
});

/**
 * El parte de horas propio: lo registrado en el rango, agrupado por dia,
 * tarea o proyecto (ADR 042). No lee tiempo de nadie mas.
 */
function RouteComponent() {
  const { t, i18n } = useTranslation();
  const { workspaceId } = Route.useParams();

  const [start, setStart] = useState(() =>
    isoDay(daysAgo(DEFAULT_RANGE_DAYS - 1)),
  );
  const [end, setEnd] = useState(() => isoDay(new Date()));
  const [groupBy, setGroupBy] = useState<TimeSheetGroupBy>("day");
  const [isExporting, setIsExporting] = useState(false);

  const query = useMemo(() => ({ start, end, groupBy }), [start, end, groupBy]);
  const { data, isPending } = useTimeSheet(workspaceId, query);

  const invalidRange = end < start;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { blob, filename } = await exportTimeSheet(workspaceId, query);
      saveAs(blob, filename);
    } catch {
      toast.error(t("timeSheet:exportError"));
    } finally {
      setIsExporting(false);
    }
  };

  const groupLabel = (key: string, label: string) => {
    if (groupBy !== "day") return label;
    return formatDate(new Date(`${key}T00:00:00`), {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const isEmpty = !isPending && (data?.groups.length ?? 0) === 0;

  return (
    <>
      <PageTitle title={t("timeSheet:pageTitle")} />
      <WorkspaceLayout title={t("timeSheet:pageTitle")}>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="time-sheet-start"
                className="text-meta text-muted-foreground"
              >
                {t("timeSheet:from")}
              </label>
              <Input
                id="time-sheet-start"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="time-sheet-end"
                className="text-meta text-muted-foreground"
              >
                {t("timeSheet:to")}
              </label>
              <Input
                id="time-sheet-end"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="time-sheet-group"
                className="text-meta text-muted-foreground"
              >
                {t("timeSheet:groupBy")}
              </label>
              <Select
                value={groupBy}
                onValueChange={(value) => setGroupBy(value as TimeSheetGroupBy)}
              >
                <SelectTrigger id="time-sheet-group" className="w-40">
                  <SelectValue>
                    {t(`timeSheet:groupByOption.${groupBy}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">
                    {t("timeSheet:groupByOption.day")}
                  </SelectItem>
                  <SelectItem value="task">
                    {t("timeSheet:groupByOption.task")}
                  </SelectItem>
                  <SelectItem value="project">
                    {t("timeSheet:groupByOption.project")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={invalidRange || isExporting || isEmpty}
              onClick={handleExport}
            >
              {t("timeSheet:export")}
            </Button>
          </div>

          {invalidRange && (
            <p className="text-destructive text-xs">
              {t("timeSheet:rangeInvalid")}
            </p>
          )}

          {isPending ? (
            <div className="space-y-2">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : isEmpty ? (
            <Empty className="min-h-[40vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileClock />
                </EmptyMedia>
                <EmptyTitle>{t("timeSheet:empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("timeSheet:empty.description")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-foreground font-medium">
                    {t(`timeSheet:groupByOption.${groupBy}`)}
                  </TableHead>
                  <TableHead className="text-right text-foreground font-medium">
                    {t("timeSheet:entries")}
                  </TableHead>
                  <TableHead className="text-right text-foreground font-medium">
                    {t("timeSheet:hours")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.groups.map((group) => (
                  <TableRow key={group.key}>
                    <TableCell>{groupLabel(group.key, group.label)}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {group.entryCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(group.seconds, i18n.language)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>{t("timeSheet:total")}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(data?.totalSeconds ?? 0, i18n.language)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>
      </WorkspaceLayout>
    </>
  );
}

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Plus,
  Rows3,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeading } from "@/components/common/page-heading";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScheduleLegend } from "./schedule-legend";
import type { HeaderTitle, ScheduleView } from "./schedule-range";

const NAV_LABEL_KEY: Record<ScheduleView, { previous: string; next: string }> =
  {
    day: { previous: "schedule:nav.previousDay", next: "schedule:nav.nextDay" },
    week: {
      previous: "schedule:nav.previousWeek",
      next: "schedule:nav.nextWeek",
    },
    month: {
      previous: "schedule:nav.previousMonth",
      next: "schedule:nav.nextMonth",
    },
  };

/**
 * Cabecera del Cronograma (ADR 041, actualizacion 2026-09-23): el mismo
 * papel que la barra de `schedule.component.html` de super-productivity
 * -cambiar de vista, moverse por el tiempo, saltar a hoy- con los controles
 * de Riuna (`SegmentedControl`, `Button`), bajo el titulo de pantalla y con
 * la leyenda de `barra-lateral.html` debajo.
 */
export function ScheduleToolbar({
  view,
  onViewChange,
  title,
  onPrevious,
  onNext,
  onToday,
  isViewingToday,
  onAddBlock,
}: {
  view: ScheduleView;
  onViewChange: (view: ScheduleView) => void;
  title: HeaderTitle;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  isViewingToday: boolean;
  onAddBlock: () => void;
}) {
  const { t } = useTranslation();
  const navLabels = NAV_LABEL_KEY[view];

  const rangeTitle =
    title.view === "week"
      ? t("schedule:weekTitle", {
          week: title.weekNumber,
          range: title.range,
        })
      : title.label;

  return (
    <TooltipProvider>
      <div className="space-y-3 border-border/80 border-b px-4 pt-4 pb-3">
        <PageHeading
          title={t("schedule:pageTitle")}
          description={rangeTitle}
          actions={
            <>
              <SegmentedControl
                label={t("schedule:view.label")}
                value={view}
                onValueChange={onViewChange}
                options={[
                  {
                    value: "day",
                    label: (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 px-1">
                            <Rows3 className="size-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("schedule:view.day")}
                        </TooltipContent>
                      </Tooltip>
                    ),
                  },
                  {
                    value: "week",
                    label: (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 px-1">
                            <Columns3 className="size-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("schedule:view.week")}
                        </TooltipContent>
                      </Tooltip>
                    ),
                  },
                  {
                    value: "month",
                    label: (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 px-1">
                            <CalendarDays className="size-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("schedule:view.month")}
                        </TooltipContent>
                      </Tooltip>
                    ),
                  },
                ]}
              />

              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={onPrevious}
                    >
                      <ChevronLeft />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t(navLabels.previous)}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={onToday}
                      disabled={isViewingToday}
                      aria-label={t("schedule:nav.today")}
                    >
                      <Sun />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("schedule:nav.today")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon-xs" onClick={onNext}>
                      <ChevronRight />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t(navLabels.next)}</TooltipContent>
                </Tooltip>
              </div>

              <Button variant="outline" size="xs" onClick={onAddBlock}>
                <Plus className="size-3.5" />
                {t("schedule:createBlock.title")}
              </Button>
            </>
          }
        />
        <ScheduleLegend />
      </div>
    </TooltipProvider>
  );
}

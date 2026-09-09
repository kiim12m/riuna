import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
} from "recharts";
import {
  CHART_MARGIN,
  CHART_TOOLTIP_CURSOR,
  ChartGrid,
  ChartTooltip,
  ChartXAxis,
  ChartYAxis,
  chartColor,
} from "@/components/charts/chart-primitives";
import { Progress } from "@/components/ui/progress";
import { StatTile } from "@/components/ui/stat-tile";
import type { Widget, WidgetConfig, WidgetPayload } from "@/fetchers/dashboard";
import { InboxWidget } from "./inbox-widget";
import { bucketLabel, toHours } from "./widget-labels";
import { WidgetTaskRow } from "./widget-task-row";

/**
 * La forma la dicta el contrato, no este fichero: se infiere de la respuesta
 * del cliente tipado, que es lo que evita que un cambio en la API pase
 * inadvertido hasta que algo se pinta vacio.
 */
export type WidgetData = Extract<WidgetPayload, { data: unknown }>["data"];

/** Elige que dibuja cada tipo de widget con los cubos que llegan. */
export function WidgetBody({
  widget,
  data,
  onOpenTask,
}: {
  widget: Widget;
  data: WidgetData;
  onOpenTask: (projectId: string, taskId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const config = widget.config as WidgetConfig;
  const buckets = data.buckets ?? [];

  const label = (key: string | null) =>
    bucketLabel(key, config.groupBy, data.labels, t, i18n.language);

  const isHours = widget.type === "time";
  const format = (value: number) =>
    isHours ? `${toHours(value)} h` : String(value);

  if (widget.type === "inbox") return <InboxWidget />;

  if (widget.type === "goal") {
    const goal = data.goal;
    if (!goal) return <Empty />;

    return (
      <ul className="space-y-2.5">
        {goal.targets.map((target) => {
          const failed = target.current === null;
          const percent = failed
            ? 0
            : Math.min(
                Math.round(((target.current ?? 0) / target.targetValue) * 100),
                100,
              );

          return (
            <li key={target.id} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-meta">
                  {target.name}
                </span>
                <span className="shrink-0 text-meta tabular-nums">
                  {failed
                    ? "—"
                    : t("goals:target.progress", {
                        current: target.current,
                        target: target.targetValue,
                      })}
                </span>
              </div>
              {!failed && <Progress value={percent} className="h-1.5" />}
            </li>
          );
        })}
      </ul>
    );
  }

  if (widget.type === "table") {
    const rows = data.rows ?? [];

    if (rows.length === 0) return <Empty />;

    return (
      <ul className="flex flex-col gap-(--density-gap)">
        {rows.map((row) => (
          <li key={row.id}>
            <WidgetTaskRow
              task={row}
              onOpen={() => onOpenTask(row.projectId, row.id)}
            />
          </li>
        ))}
      </ul>
    );
  }

  if (widget.type === "count") {
    const bucket = buckets[0];
    const value = bucket?.value ?? 0;
    const total = bucket?.total;
    // `doneRatio` trae denominador, y es lo que convierte una cifra suelta en
    // un avance: "12 de 34" dice algo que "12" no dice.
    const percent =
      total && total > 0 ? Math.round((value / total) * 100) : null;

    return (
      <div className="space-y-2">
        <StatTile
          className="border-0 p-0"
          label={t(`panels:metric.${config.metric ?? "count"}`)}
          value={
            total === undefined
              ? format(value)
              : t("panels:widget.ofTotal", { value, total })
          }
        />
        {percent !== null && <Progress value={percent} className="h-1.5" />}
      </div>
    );
  }

  if (widget.type === "epic_progress") {
    if (buckets.length === 0) return <Empty />;

    return (
      <ul className="flex flex-col gap-2">
        {buckets.map((bucket) => {
          const total = bucket.total ?? 0;
          const percent =
            total > 0 ? Math.round((bucket.value / total) * 100) : 0;

          return (
            <li key={bucket.key ?? "none"} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-meta">
                  {label(bucket.key)}
                </span>
                <span className="shrink-0 text-muted-foreground text-[10px] tabular-nums">
                  {bucket.value}/{total}
                </span>
              </div>
              <Progress value={percent} className="h-1.5" />
            </li>
          );
        })}
      </ul>
    );
  }

  if (buckets.length === 0) return <Empty />;

  // Con cuatro cubos o menos, una grafica de barras es una tabla con pasos de
  // mas: dentro de una tarjeta se lee antes la lista, y ademas cabe la cifra
  // exacta al lado del nombre.
  if (widget.type !== "trend" && buckets.length <= 4) {
    const max = Math.max(...buckets.map((bucket) => bucket.value), 1);

    return (
      <ul className="flex flex-col gap-1.5">
        {buckets.map((bucket, index) => (
          <li key={bucket.key ?? "none"} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-meta">
                {label(bucket.key)}
              </span>
              <span className="shrink-0 font-medium text-body tabular-nums">
                {format(bucket.value)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-(--motion-base) ease-out-quart"
                style={{
                  width: `${Math.round((bucket.value / max) * 100)}%`,
                  background: chartColor(index),
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const chartData = buckets.map((bucket) => ({
    name: label(bucket.key),
    value: isHours ? toHours(bucket.value) : bucket.value,
  }));

  // La tendencia es una linea; el resto, barras. Nunca dos ejes: la ADR 025 ya
  // decidio que eso deja elegir la historia a quien dibuja.
  if (widget.type === "trend") {
    return (
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <ChartGrid />
            <ChartXAxis dataKey="name" minTickGap={16} />
            <ChartYAxis />
            <ChartTooltip formatter={(value) => [format(Number(value)), ""]} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={CHART_MARGIN}>
          <ChartGrid />
          <ChartXAxis dataKey="name" />
          <ChartYAxis />
          <ChartTooltip
            cursor={CHART_TOOLTIP_CURSOR}
            formatter={(value) => [format(Number(value)), ""]}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={chartColor(index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Empty() {
  const { t } = useTranslation();
  return (
    <p className="py-6 text-center text-muted-foreground text-meta">
      {t("panels:widget.noData")}
    </p>
  );
}

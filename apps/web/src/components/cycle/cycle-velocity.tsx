import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VelocityPoint } from "@/fetchers/cycle";
import type { BurndownUnit } from "./cycle-burndown";

/**
 * Velocidad: cuanto se completo de verdad en cada ciclo ya cerrado.
 *
 * Una sola serie, asi que no lleva leyenda —el titulo la nombra— ni paleta
 * categorica. Misma unidad conmutable que el burndown, y por el mismo motivo:
 * dos escalas en un grafico dejan elegir la historia.
 */
export function CycleVelocity({
  history,
  unit,
}: {
  history: VelocityPoint[];
  unit: BurndownUnit;
}) {
  const { t } = useTranslation();

  const data = history.map((point) => ({
    name: point.name,
    value:
      unit === "tasks"
        ? point.doneTasks
        : Math.round((point.doneEstimateSeconds / 3600) * 10) / 10,
  }));

  const suffix = unit === "tasks" ? "" : " h";

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid
            horizontal
            vertical={false}
            stroke="var(--color-border)"
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <YAxis
            allowDecimals={false}
            width={48}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-popover-foreground)",
            }}
            formatter={(value) => [
              `${value ?? 0}${suffix}`,
              t("cycles:velocity.completed"),
            ]}
          />
          <Bar
            dataKey="value"
            fill="var(--color-chart-1)"
            // Extremo redondeado de 4 px anclado a la linea base, no una capsula:
            // la barra tiene que arrancar del cero sin curva.
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

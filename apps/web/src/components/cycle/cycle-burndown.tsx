import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CycleReport } from "@/fetchers/cycle";

export type BurndownUnit = "tasks" | "hours";

/**
 * Burndown: lo que queda por hacer, dia a dia, contra la linea ideal.
 *
 * **Una sola unidad a la vez, nunca dos ejes.** Tareas y horas no comparten
 * escala, y un grafico de doble eje deja que el que lo dibuja elija la historia
 * moviendo una escala respecto de la otra. El conmutador es lo que evita eso.
 *
 * La unidad es conmutable y no fija porque un burndown de horas es una linea
 * plana en cero cuando el equipo no estima, y eso parece un fallo en vez de una
 * ausencia de datos.
 *
 * Dos trazos, no dos series de la misma clase: el real lleva el acento de marca
 * y el ideal es una referencia discontinua en tinta apagada. Por eso no hace
 * falta una paleta categorica —no hay identidades que distinguir— y el color no
 * carga solo con el significado: la leyenda nombra los dos.
 */
export function CycleBurndown({
  report,
  unit,
}: {
  report: CycleReport;
  unit: BurndownUnit;
}) {
  const { t } = useTranslation();

  const toHours = (seconds: number | null) =>
    seconds === null ? null : Math.round((seconds / 3600) * 10) / 10;

  const data = report.burndown.map((point) => ({
    day: point.day,
    label: point.day.slice(5),
    actual:
      unit === "tasks" ? point.remainingTasks : toHours(point.remainingSeconds),
    ideal: unit === "tasks" ? point.idealTasks : toHours(point.idealSeconds),
  }));

  const suffix = unit === "tasks" ? "" : " h";

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          {/* Rejilla recesiva: solo horizontales, para leer alturas sin competir
              con los trazos. */}
          <CartesianGrid
            horizontal
            vertical={false}
            stroke="var(--color-border)"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            minTickGap={16}
          />
          <YAxis
            allowDecimals={false}
            width={48}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-popover-foreground)",
            }}
            formatter={(value, name) => [
              value === null || value === undefined ? "—" : `${value}${suffix}`,
              String(name),
            ]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="plainline"
            wrapperStyle={{
              fontSize: 11,
              color: "var(--color-muted-foreground)",
              paddingBottom: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="ideal"
            name={t("cycles:burndown.ideal")}
            stroke="var(--color-muted-foreground)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name={t("cycles:burndown.actual")}
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
            // Un punto por dia satura una serie de dos semanas; el marcador
            // aparece donde el puntero pregunta.
            activeDot={{ r: 4, strokeWidth: 0 }}
            // `connectNulls` en false es lo que hace que la linea real **pare**
            // en el dia de hoy en vez de cruzar el futuro en linea recta.
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

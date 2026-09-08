import { CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Los ejes, la rejilla y el tooltip que comparten todas las graficas de Riuna.
 *
 * Estaban copiados byte a byte entre el burndown y la velocidad de ciclos; los
 * paneles de la Fase 7 eran la tercera copia, asi que la regla de tres dispara
 * aqui. El color sale siempre de tokens: en `marca.md` no hay ni un hex
 * literal en los componentes, y esto no lo va a estrenar.
 */

export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: -16 };

/** La serie n-esima de una grafica categorica, en el orden de la paleta. */
export function chartColor(index: number): string {
  return `var(--color-chart-${(index % 5) + 1})`;
}

export function ChartGrid() {
  return (
    <CartesianGrid horizontal vertical={false} stroke="var(--color-border)" />
  );
}

export function ChartXAxis({
  dataKey,
  minTickGap,
}: {
  dataKey: string;
  /** Solo cuando las etiquetas son fechas y se pisan. */
  minTickGap?: number;
}) {
  return (
    <XAxis
      dataKey={dataKey}
      minTickGap={minTickGap}
      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
      tickLine={false}
      axisLine={{ stroke: "var(--color-border)" }}
    />
  );
}

export function ChartYAxis({
  allowDecimals = false,
  width = 48,
}: {
  allowDecimals?: boolean;
  width?: number;
}) {
  return (
    <YAxis
      allowDecimals={allowDecimals}
      width={width}
      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
      tickLine={false}
      axisLine={false}
    />
  );
}

export const CHART_TOOLTIP_STYLE = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-popover-foreground)",
} as const;

export const CHART_TOOLTIP_CURSOR = {
  fill: "var(--color-muted)",
  opacity: 0.4,
} as const;

export function ChartTooltip(props: React.ComponentProps<typeof Tooltip>) {
  return <Tooltip contentStyle={CHART_TOOLTIP_STYLE} {...props} />;
}

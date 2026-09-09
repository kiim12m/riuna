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

/** Cuantos tonos de identidad tiene la paleta de datos. */
export const CHART_SLOTS = 8;

/**
 * La serie n-esima de una grafica categorica, en el orden de la paleta.
 *
 * **Apunta a `--chart-N`, no a `--color-chart-N`.** Los segundos viven en un
 * bloque `@theme inline`, que Tailwind poda: solo emite la variable si alguna
 * fuente la nombra literalmente. Como este nombre se construia en tiempo de
 * ejecucion, solo sobrevivia el 1 —el unico escrito a pelo en el codigo— y las
 * demas series resolvian a transparente. En un reparto de seis proyectos eso
 * eran cuatro barras negras. El DOM estaba bien: solo fallaba el color
 * computado, que es justo lo que ninguna prueba sobre clases podia ver.
 *
 * **No cicla.** Repetir el tono a partir del noveno haria que dos series
 * distintas compartieran identidad, que es peor que no distinguirlas: la cola
 * va al neutro de «otros», que es lo que el agregado ya suma aparte.
 */
export function chartColor(index: number): string {
  if (index < 0 || index >= CHART_SLOTS) return "var(--chart-other)";
  return `var(--chart-${index + 1})`;
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

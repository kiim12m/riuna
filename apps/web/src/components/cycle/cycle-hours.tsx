import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CycleReport } from "@/fetchers/cycle";
import { getInitials } from "@/lib/get-initials";

/**
 * Horas por persona.
 *
 * **No es un grafico de libreria a proposito.** Son unas pocas filas con nombre
 * propio, asi que una lista con la barra etiquetada al lado se lee mejor que un
 * grafico de barras horizontal: cada valor va escrito, no hay eje que
 * interpretar, no hace falta leyenda y el orden ya lo dice todo. La barra es
 * solo la comparacion visual.
 */
export function CycleHours({
  report,
}: {
  report: CycleReport["hoursByPerson"];
}) {
  const { t } = useTranslation();

  if (report.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        {t("cycles:hours.empty")}
      </p>
    );
  }

  const max = Math.max(...report.map((person) => person.seconds));

  return (
    <ul className="space-y-2">
      {report.map((person) => {
        const hours = Math.round((person.seconds / 3600) * 10) / 10;
        const share = max > 0 ? (person.seconds / max) * 100 : 0;

        return (
          <li
            key={person.userId ?? "unassigned"}
            className="flex items-center gap-3"
          >
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={person.image ?? undefined} />
              <AvatarFallback className="text-label">
                {getInitials(person.name)}
              </AvatarFallback>
            </Avatar>
            <span className="w-32 shrink-0 truncate text-sm">
              {person.name ?? t("cycles:hours.unknownPerson")}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-chart-1"
                style={{ width: `${share}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right font-medium text-sm tabular-nums">
              {hours} h
            </span>
          </li>
        );
      })}
    </ul>
  );
}

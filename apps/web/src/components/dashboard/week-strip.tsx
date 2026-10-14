import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { dayKey, parseDayKey } from "@/lib/day-key";
import { getPriorityLabel } from "@/lib/i18n/domain";

type WeekTask = {
  id: string;
  number: number;
  title: string;
  priority: string;
  isDone: boolean;
  projectId: string;
  projectName: string;
};

export type WeekDay = {
  /** `yyyy-mm-dd` del dia del servidor, tal cual lo manda la API. */
  day: string;
  tasks: WeekTask[];
  overflow: number;
};

/**
 * Lo planificado para la semana en curso, un dia por columna.
 *
 * Es lo que ninguna cifra puede decir —"que tengo planificado el jueves"— y lo
 * unico que antes obligaba a salir del panel al Planificador. Cada tarea sale
 * en el dia en que se planifico, no en el que vence (ADR 090). La ventana la
 * decide el servidor a partir de la preferencia de inicio de semana, la misma
 * que ya usan calendario, Gantt y Cronograma: aqui no se recalcula nada.
 *
 * En movil son siete filas y no siete columnas: a 320 px cada columna serian
 * 45 px, donde no cabe ni un titulo.
 */
export function WeekStrip({
  days,
  onOpenTask,
}: {
  days: WeekDay[];
  onOpenTask: (projectId: string, taskId: string) => void;
}) {
  const { t, i18n } = useTranslation();

  // Los nombres de dia salen de `Intl`, no de claves de i18n: son datos del
  // idioma, no copia del producto, y una traduccion a mano seria una segunda
  // fuente que mantener.
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
  const todayKey = dayKey(new Date());

  return (
    <ol className="grid grid-cols-1 gap-(--density-gap) sm:grid-cols-7">
      {days.map((day) => {
        const date = parseDayKey(day.day);
        const isToday = day.day === todayKey;

        return (
          <li
            key={day.day}
            className={cn(
              "flex min-w-0 flex-col gap-1 rounded-md border border-transparent p-1",
              // El dia de hoy no se distingue solo por color: lleva tambien un
              // borde y el peso del rotulo. `marca.md` principio 2.
              isToday && "border-brand/40 bg-brand/8",
            )}
          >
            <p className="flex items-baseline justify-between gap-1 px-0.5">
              <span
                className={cn(
                  "truncate text-meta uppercase",
                  // `text-brand-foreground` **no** vale aqui: es el color del
                  // texto que va *encima* de un relleno de marca, no el de un
                  // texto de marca sobre el fondo de la tarjeta. Puesto asi
                  // daba verde oscuro sobre casi negro en tema oscuro y blanco
                  // sobre casi blanco en claro; ilegible en los dos. El dia de
                  // hoy ya se distingue por el borde y el tinte del contenedor
                  // —`marca.md` principio 2, nunca solo por color—, asi que al
                  // rotulo le basta con el peso.
                  isToday
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {weekday.format(date)} {date.getDate()}
              </span>
              {day.tasks.length > 0 && (
                <span className="shrink-0 text-meta text-muted-foreground tabular-nums">
                  {day.tasks.length + day.overflow}
                </span>
              )}
            </p>

            {day.tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task.projectId, task.id)}
                title={`${task.title} · ${task.projectName}`}
                className={cn(
                  "w-full truncate rounded-sm border border-border bg-muted/40 px-1.5 py-1 text-left text-meta transition-colors duration-(--motion-fast) hover:bg-accent",
                  task.isDone && "text-muted-foreground line-through",
                )}
              >
                <span className="sr-only">
                  {getPriorityLabel(task.priority)} ·{" "}
                </span>
                {task.title}
              </button>
            ))}

            {day.overflow > 0 && (
              <p className="px-1 text-meta text-muted-foreground">
                {t("panels:week.more", { count: day.overflow })}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

import { eq, inArray } from "drizzle-orm";
import type { Content } from "pdfmake/interfaces";
import db from "../database";
import {
  projectTable,
  taskTable,
  userTable,
  workspaceTable,
} from "../database/schema";
import type { TimeSheetGroupBy } from "../time-sheet/constants";
import getTimeSheet from "../time-sheet/controllers/get-time-sheet";
import { dayKeysBetween, serverDayKey } from "../utils/day-boundaries";
import { capacityForDay } from "../work-schedule/day-capacity";
import { getWorkSchedule } from "../work-schedule/get-work-schedule";
import { loadUnavailableDays } from "../work-schedule/unavailable-days";
import { taskKey } from "./context";
import {
  dataTable,
  type PdfColumn,
  pdfDocument,
  sectionTitle,
} from "./document";
import {
  formatClock,
  formatHours,
  formatLongDate,
  formatWeekday,
} from "./format";

const GROUP_WORD: Record<TimeSheetGroupBy, string> = {
  day: "día",
  task: "tarea",
  project: "proyecto",
};

/** Cuantos dias caben en una fila del resumen sin que deje de leerse. */
const DAYS_PER_ROW = 7;

/** La jornada de cada dia (ADR 045, ADR 060): cero si es festivo o ausencia. */
async function workdayCapacity(params: {
  workspaceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
}) {
  const [schedule, unavailable] = await Promise.all([
    getWorkSchedule(params.userId),
    loadUnavailableDays({
      workspaceId: params.workspaceId,
      userId: params.userId,
      start: params.windowStart,
      end: params.windowEnd,
    }),
  ]);
  return (dayKey: string) =>
    capacityForDay(
      schedule,
      new Date(`${dayKey}T12:00:00`),
      [],
      unavailable.has(dayKey),
    );
}

function signatures(): Content {
  const box = (label: string): Content => ({
    stack: [
      {
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5 },
        ],
        margin: [0, 48, 0, 4],
      },
      { text: label, color: "#6b7280", fontSize: 8 },
    ],
  });
  return {
    columns: [box("Firma de la persona"), box("Visto bueno del responsable")],
    columnGap: 40,
    unbreakable: true,
    margin: [0, 16, 0, 0],
  };
}

/**
 * El parte de horas en PDF (ADR 091): las entradas de quien lo pide, como en
 * pantalla —la misma consulta de `getTimeSheet`—, con su total, un resumen de
 * lo registrado frente a la jornada de cada dia y sitio para dos firmas.
 */
export async function buildTimeSheetPdf(params: {
  workspaceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  groupBy: TimeSheetGroupBy;
}) {
  const [sheet, capacityOf, people, workspace] = await Promise.all([
    getTimeSheet(params),
    workdayCapacity(params),
    db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, params.userId)),
    db
      .select({ name: workspaceTable.name })
      .from(workspaceTable)
      .where(eq(workspaceTable.id, params.workspaceId)),
  ]);
  const person = people[0]?.name ?? "";

  const entries = sheet.groups.flatMap((group) => group.entries);
  const taskIds = [...new Set(entries.map((entry) => entry.taskId))];
  const keys = new Map(
    (taskIds.length > 0
      ? await db
          .select({
            id: taskTable.id,
            number: taskTable.number,
            slug: projectTable.slug,
          })
          .from(taskTable)
          .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
          .where(inArray(taskTable.id, taskIds))
      : []
    ).map((row) => [row.id, taskKey(row.slug, row.number)]),
  );
  const taskLabel = (entry: (typeof entries)[number]) =>
    `${keys.get(entry.taskId) ?? ""} ${entry.taskTitle}`.trim();

  const lead: PdfColumn = {
    header: { day: "Día", task: "Tarea", project: "Proyecto" }[params.groupBy],
    width: params.groupBy === "day" ? "auto" : "*",
  };
  const columns: PdfColumn[] = [
    lead,
    ...(params.groupBy === "project"
      ? [{ header: "Tarea", width: "*" as const }]
      : []),
    ...(params.groupBy === "day"
      ? [{ header: "Tarea", width: "*" as const }]
      : [{ header: "Día" }]),
    { header: "Inicio", noWrap: true },
    { header: "Fin", noWrap: true },
    { header: "Duración", align: "right" },
  ];

  // El grupo se nombra en su primera fila; las demas lo dejan en blanco, como
  // en la maqueta, y se lee como un bloque.
  const rows = sheet.groups.flatMap((group) =>
    group.entries.map((entry, index) => {
      const first = index === 0;
      const label =
        params.groupBy === "day"
          ? formatWeekday(entry.startTime)
          : params.groupBy === "task"
            ? taskLabel(entry)
            : entry.projectName;
      return [
        first ? label : "",
        ...(params.groupBy === "project" ? [taskLabel(entry)] : []),
        params.groupBy === "day"
          ? taskLabel(entry)
          : formatWeekday(entry.startTime),
        formatClock(entry.startTime),
        formatClock(entry.endTime),
        formatHours(entry.seconds),
      ];
    }),
  );

  // Lo registrado y la jornada de cada dia, en filas de una semana.
  const loggedByDay = new Map<string, number>();
  for (const entry of entries) {
    const key = serverDayKey(entry.startTime);
    loggedByDay.set(key, (loggedByDay.get(key) ?? 0) + entry.seconds);
  }
  const days = dayKeysBetween(params.windowStart, params.windowEnd);
  const summaries: Content[] = [];
  for (let index = 0; index < days.length; index += DAYS_PER_ROW) {
    const week = days.slice(index, index + DAYS_PER_ROW);
    summaries.push(
      dataTable({
        columns: [
          { header: "", width: "*" },
          ...week.map(
            (day): PdfColumn => ({
              header: formatWeekday(new Date(`${day}T12:00:00`)),
              align: "right",
            }),
          ),
        ],
        rows: [
          [
            "Registrado",
            ...week.map((day) => formatHours(loggedByDay.get(day) ?? 0)),
          ],
          ["Jornada", ...week.map((day) => formatHours(capacityOf(day)))],
        ],
      }),
    );
  }

  const document = pdfDocument({
    context: workspace[0]?.name ?? "",
    author: person,
    title: `Parte de horas · ${person}`,
    subtitle: `Del ${formatLongDate(params.windowStart)} al ${formatLongDate(params.windowEnd)} · agrupado por ${GROUP_WORD[params.groupBy]}`,
    content: [
      dataTable({
        columns,
        rows,
        totals: [
          "Total del periodo",
          ...columns.slice(1, -1).map(() => ""),
          formatHours(sheet.totalSeconds),
        ],
      }),
      sectionTitle("Resumen por día"),
      ...summaries,
      signatures(),
    ],
  });

  return {
    document,
    filename: `parte-de-horas-${serverDayKey(params.windowStart)}-${serverDayKey(params.windowEnd)}.pdf`,
  };
}

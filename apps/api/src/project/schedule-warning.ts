import type { WorkCalendar } from "../task/schedule/work-calendar";

/**
 * El aviso de un proyecto desviado (ADR 087): sus tareas acaban despues de su
 * fecha de fin, y cuantos dias laborables. Como el de un padre con fechas
 * propias (ADR 083), con el mismo calendario.
 */
export function projectScheduleWarning(
  endDate: Date | null,
  tasksDueDate: Date | null,
  calendar: WorkCalendar,
) {
  if (!endDate || !tasksDueDate || tasksDueDate <= endDate) return null;
  const nextDay = new Date(endDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return {
    tasksDueDate,
    overflowWorkDays: calendar.workDaysBetween(nextDay, tasksDueDate),
  };
}

import { formatDate } from "@/lib/format";

/** La hora de los atajos de «Recuérdamelo»: el principio de la mañana. */
export const PRESET_HOUR = 9;

export type ReminderPreset = "tomorrow" | "nextMonday" | "inAWeek";

function atPresetHour(date: Date) {
  const result = new Date(date);
  result.setHours(PRESET_HOUR, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * El instante de cada atajo en la hora local de quien lo pulsa (ADR 077). «El
 * próximo lunes» nunca es hoy: un lunes por la mañana salta al siguiente.
 */
export function reminderPresetDate(preset: ReminderPreset, now = new Date()) {
  switch (preset) {
    case "tomorrow":
      return atPresetHour(addDays(now, 1));
    case "nextMonday": {
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      return atPresetHour(addDays(now, daysUntilMonday));
    }
    case "inAWeek":
      return atPresetHour(addDays(now, 7));
  }
}

export const REMINDER_PRESETS: ReminderPreset[] = [
  "tomorrow",
  "nextMonday",
  "inAWeek",
];

/** «2026-10-15» y «09:30» de los campos del formulario, en hora local. */
export function reminderFromInputs(day: string, time: string) {
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  if (!year || !month || !date || hours === undefined || minutes === undefined)
    return null;
  const result = new Date(year, month - 1, date, hours, minutes, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** «jue 15 oct, 9:00»: como se enseña la hora de un recordatorio. */
export function formatReminderTime(value: Date | string) {
  return formatDate(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

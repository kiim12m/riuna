const MINUTE_MS = 60 * 1000;

export const REMINDER_WINDOW_MINUTES = 10;

/**
 * La antelacion maxima de un recordatorio -30 dias-, la misma que imponen los
 * validadores y la `CHECK` de `user_notification_preference`. Acota por arriba
 * los vencimientos que pueden tocar ahora, para que la consulta del trabajo
 * use el indice de `due_date` en vez de recorrer toda la tabla.
 */
export const MAX_REMINDER_LEAD_MINUTES = 43_200;

export function isReminderDue({
  dueDate,
  leadTimeMinutes,
  now,
}: {
  dueDate: Date;
  leadTimeMinutes: number;
  now: Date;
}) {
  const targetTime = dueDate.getTime() - leadTimeMinutes * MINUTE_MS;
  const elapsedSinceTarget = now.getTime() - targetTime;

  return (
    elapsedSinceTarget >= 0 &&
    elapsedSinceTarget <= REMINDER_WINDOW_MINUTES * MINUTE_MS
  );
}

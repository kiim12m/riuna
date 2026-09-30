/** `"09:30"` -> 570. Lo que da un `<input type="time">`. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** 570 -> `"09:30"`, lo que pide `<input type="time">`. */
export function fromMinutes(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  const mins = String(minute % 60).padStart(2, "0");
  return `${hours}:${mins}`;
}

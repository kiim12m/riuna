import { describe, expect, it } from "vitest";
import {
  advancePast,
  type Cadence,
  firstOnOrAfter,
  nextOccurrence,
  parseCadence,
} from "../../../apps/api/src/recurrence/cadence";

/** Fecha local a medianoche, que es la unidad con la que trabaja la cadencia. */
function day(iso: string) {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("parseCadence", () => {
  it("accepts the three frequencies", () => {
    expect(parseCadence({ frequency: "daily", interval: 2 })).toEqual({
      frequency: "daily",
      interval: 2,
    });
    expect(
      parseCadence({ frequency: "weekly", interval: 1, byWeekday: [3, 1, 1] }),
    ).toEqual({ frequency: "weekly", interval: 1, byWeekday: [1, 3] });
    expect(
      parseCadence({ frequency: "monthly", interval: 1, byMonthDay: 15 }),
    ).toEqual({ frequency: "monthly", interval: 1, byMonthDay: 15 });
  });

  it("defaults the interval to one", () => {
    expect(parseCadence({ frequency: "daily" })).toEqual({
      frequency: "daily",
      interval: 1,
    });
  });

  // La cadencia vive en un `jsonb`, asi que esta funcion es lo unico que impide
  // que una fila con basura llegue al planificador.
  it("rejects what the column cannot", () => {
    expect(() => parseCadence(null)).toThrow();
    expect(() => parseCadence({ frequency: "yearly" })).toThrow();
    expect(() => parseCadence({ frequency: "daily", interval: 0 })).toThrow();
    expect(() => parseCadence({ frequency: "daily", interval: 1.5 })).toThrow();
    expect(() => parseCadence({ frequency: "daily", interval: 400 })).toThrow();
    expect(() =>
      parseCadence({ frequency: "weekly", interval: 1, byWeekday: [] }),
    ).toThrow();
    expect(() =>
      parseCadence({ frequency: "weekly", interval: 1, byWeekday: [9] }),
    ).toThrow();
    expect(() =>
      parseCadence({ frequency: "monthly", interval: 1, byMonthDay: 32 }),
    ).toThrow();
  });
});

describe("nextOccurrence", () => {
  it("advances a daily cadence by its interval", () => {
    const cadence: Cadence = { frequency: "daily", interval: 3 };
    expect(iso(nextOccurrence(cadence, day("2026-01-01")))).toBe("2026-01-04");
  });

  // Siempre estrictamente posterior: si devolviera el mismo dia, el planificador
  // generaria la misma tarea en cada vuelta sin avanzar nunca.
  it("never returns the date it was given", () => {
    const cadences: Cadence[] = [
      { frequency: "daily", interval: 1 },
      { frequency: "weekly", interval: 1, byWeekday: [0, 1, 2, 3, 4, 5, 6] },
      { frequency: "monthly", interval: 1, byMonthDay: 15 },
    ];

    for (const cadence of cadences) {
      const from = day("2026-03-15");
      expect(nextOccurrence(cadence, from).getTime()).toBeGreaterThan(
        from.getTime(),
      );
    }
  });

  it("finds the next marked weekday", () => {
    // 2026-01-01 es jueves (4). Lunes(1) y miercoles(3).
    const cadence: Cadence = {
      frequency: "weekly",
      interval: 1,
      byWeekday: [1, 3],
    };
    const first = nextOccurrence(cadence, day("2026-01-01"));
    expect(iso(first)).toBe("2026-01-05"); // lunes
    expect(iso(nextOccurrence(cadence, first))).toBe("2026-01-07"); // miercoles
  });

  it("skips weeks when the weekly interval is greater than one", () => {
    // Cada dos semanas, los lunes. Desde el jueves 2026-01-01.
    const cadence: Cadence = {
      frequency: "weekly",
      interval: 2,
      byWeekday: [1],
    };
    const first = nextOccurrence(cadence, day("2026-01-05")); // es lunes
    expect(iso(first)).toBe("2026-01-19"); // dos semanas despues, no el 12
  });

  // Las semanas que tocan traen **todos** sus dias marcados. Contar semanas por
  // dias transcurridos (offset / 7) se saltaba el miercoles de la semana del
  // lunes y dejaba la recurrencia en solo lunes.
  it("keeps every marked weekday of the weeks it lands on", () => {
    const cadence: Cadence = {
      frequency: "weekly",
      interval: 2,
      byWeekday: [1, 3],
    };

    const dates = [day("2026-01-05")]; // lunes
    for (let i = 0; i < 4; i += 1) {
      dates.push(nextOccurrence(cadence, dates[dates.length - 1] as Date));
    }

    expect(dates.map(iso)).toEqual([
      "2026-01-05",
      "2026-01-07",
      "2026-01-19",
      "2026-01-21",
      "2026-02-02",
    ]);
  });

  // La trampa clasica: `setDate(31)` sobre febrero se desborda a marzo en vez
  // de fallar, y la tarea del dia 31 aparece el 3 de marzo.
  it("clamps the day of the month instead of overflowing", () => {
    const cadence: Cadence = {
      frequency: "monthly",
      interval: 1,
      byMonthDay: 31,
    };

    expect(iso(nextOccurrence(cadence, day("2026-01-31")))).toBe("2026-02-28");
    expect(iso(nextOccurrence(cadence, day("2026-02-28")))).toBe("2026-03-31");
    expect(iso(nextOccurrence(cadence, day("2026-03-31")))).toBe("2026-04-30");
  });

  it("handles February in a leap year", () => {
    const cadence: Cadence = {
      frequency: "monthly",
      interval: 1,
      byMonthDay: 30,
    };
    // 2028 es bisiesto: febrero tiene 29.
    expect(iso(nextOccurrence(cadence, day("2028-01-30")))).toBe("2028-02-29");
  });

  it("takes the day later in the same month when it has not passed yet", () => {
    const cadence: Cadence = {
      frequency: "monthly",
      interval: 1,
      byMonthDay: 20,
    };
    expect(iso(nextOccurrence(cadence, day("2026-01-05")))).toBe("2026-01-20");
  });

  it("skips months when the monthly interval is greater than one", () => {
    const cadence: Cadence = {
      frequency: "monthly",
      interval: 3,
      byMonthDay: 10,
    };
    expect(iso(nextOccurrence(cadence, day("2026-01-10")))).toBe("2026-04-10");
  });
});

describe("firstOnOrAfter", () => {
  // Una recurrencia que empieza hoy genera la tarea de hoy: la cadencia es
  // "toca hoy" (ADR 026), y el inicio es un dia que cuenta.
  it("returns the start day itself when it falls on the cadence", () => {
    const daily: Cadence = { frequency: "daily", interval: 1 };
    expect(iso(firstOnOrAfter(daily, day("2026-01-05")))).toBe("2026-01-05");

    const mondays: Cadence = {
      frequency: "weekly",
      interval: 1,
      byWeekday: [1],
    };
    expect(iso(firstOnOrAfter(mondays, day("2026-01-05")))).toBe("2026-01-05");

    const fifteenth: Cadence = {
      frequency: "monthly",
      interval: 1,
      byMonthDay: 15,
    };
    expect(iso(firstOnOrAfter(fifteenth, day("2026-01-15")))).toBe(
      "2026-01-15",
    );
  });

  it("snaps a start that does not fall on the cadence to the next day that does", () => {
    const cadence: Cadence = {
      frequency: "weekly",
      interval: 2,
      byWeekday: [1, 3],
    };
    // Martes: el miercoles de esa misma semana es la primera ocurrencia.
    expect(iso(firstOnOrAfter(cadence, day("2026-01-06")))).toBe("2026-01-07");
  });

  it("never goes before the floor, keeping the phase of a past start", () => {
    const cadence: Cadence = {
      frequency: "weekly",
      interval: 2,
      byWeekday: [1],
    };
    // Empezo el lunes 5; hoy es el jueves 15. El lunes 12 no toca (semana de
    // descanso), asi que la siguiente es el 19, no el 12 ni el 26.
    expect(
      iso(firstOnOrAfter(cadence, day("2026-01-05"), day("2026-01-15"))),
    ).toBe("2026-01-19");
    // Y si "hoy" cae en una ocurrencia, es hoy.
    expect(
      iso(firstOnOrAfter(cadence, day("2026-01-05"), day("2026-01-19"))),
    ).toBe("2026-01-19");
  });
});

describe("advancePast", () => {
  // Si la instancia ha estado parada tres dias, lo que se espera es UNA tarea y
  // la proxima fecha al dia: ni tres tareas de golpe ni una fecha en el pasado
  // que vuelva a disparar en la siguiente vuelta.
  it("catches up to the future in one go and says how many it skipped", () => {
    const cadence: Cadence = { frequency: "daily", interval: 1 };
    const { nextRunAt, skipped } = advancePast(
      cadence,
      day("2026-01-01"),
      day("2026-01-04"),
    );

    expect(iso(nextRunAt)).toBe("2026-01-05");
    expect(skipped).toBe(4);
    expect(nextRunAt.getTime()).toBeGreaterThan(day("2026-01-04").getTime());
  });

  it("advances exactly once when only one occurrence is due", () => {
    const cadence: Cadence = { frequency: "daily", interval: 1 };
    const { nextRunAt, skipped } = advancePast(
      cadence,
      day("2026-01-01"),
      day("2026-01-01"),
    );

    expect(iso(nextRunAt)).toBe("2026-01-02");
    expect(skipped).toBe(1);
  });

  it("stops instead of looping forever on an absurd backlog", () => {
    const cadence: Cadence = { frequency: "daily", interval: 1 };
    const { skipped } = advancePast(
      cadence,
      day("1990-01-01"),
      day("2026-01-01"),
    );
    expect(skipped).toBeLessThanOrEqual(1000);
  });
});

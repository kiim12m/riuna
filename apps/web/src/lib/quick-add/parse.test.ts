import { describe, expect, it } from "vitest";
import { parseQuickAdd, type QuickAddContext } from "./parse";

// Miercoles 14 de octubre de 2026, a media mañana.
const context: QuickAddContext = {
  today: new Date(2026, 9, 14, 11, 20),
  labels: [
    { id: "l-urg", name: "Urgente" },
    { id: "l-esp", name: "En espera" },
    { id: "l-cli", name: "Cliente" },
  ],
  projects: [
    { id: "p-obr", slug: "OBR", name: "Obra Norte" },
    { id: "p-man", slug: "MAN", name: "Mantenimiento" },
  ],
};

function parse(input: string) {
  return parseQuickAdd(input, context);
}

describe("parseQuickAdd: titulo", () => {
  it("deja el texto llano como titulo", () => {
    expect(parse("Llamar al proveedor")).toMatchObject({
      title: "Llamar al proveedor",
      estimate: null,
      plannedDate: null,
      startMinute: null,
      dueDate: null,
      labels: [],
      project: null,
      priority: null,
    });
  });

  it("colapsa los espacios y recorta", () => {
    expect(parse("  Llamar   al  proveedor ").title).toBe(
      "Llamar al proveedor",
    );
  });

  it("devuelve un titulo vacio si solo hay marcas", () => {
    expect(parse("@hoy 1h").title).toBe("");
  });

  it("no toca los numeros sueltos", () => {
    expect(parse("Pedir 3 cajas").title).toBe("Pedir 3 cajas");
  });

  it("no toca una direccion de correo", () => {
    expect(parse("Escribir a ana@obra.es").title).toBe(
      "Escribir a ana@obra.es",
    );
  });
});

describe("parseQuickAdd: estimacion", () => {
  it.each([
    ["1h", 3600],
    ["30m", 1800],
    ["90min", 5400],
    ["1h30", 5400],
    ["1h30m", 5400],
    ["1,5h", 5400],
    ["1.5h", 5400],
    ["2H", 7200],
  ])("lee %s", (token, seconds) => {
    const result = parse(`Revisar planos ${token}`);
    expect(result.estimate).toBe(seconds);
    expect(result.title).toBe("Revisar planos");
  });

  it("suma «1h 30m»", () => {
    expect(parse("Revisar 1h 30m").estimate).toBe(5400);
  });

  it("no toma una hora del dia por estimacion", () => {
    const result = parse("Reunion 10:00");
    expect(result.estimate).toBeNull();
    expect(result.title).toBe("Reunion 10:00");
  });

  it("no toma «0m» por estimacion", () => {
    expect(parse("Nada 0m").estimate).toBeNull();
  });
});

describe("parseQuickAdd: dia del plan", () => {
  it.each([
    ["@hoy", "2026-10-14"],
    ["@mañana", "2026-10-15"],
    ["@manana", "2026-10-15"],
    ["@Mañana", "2026-10-15"],
    ["@pasado", "2026-10-16"],
    ["@vie", "2026-10-16"],
    ["@sáb", "2026-10-17"],
    ["@sabado", "2026-10-17"],
    ["@dom", "2026-10-18"],
    ["@lunes", "2026-10-19"],
    ["@mar", "2026-10-20"],
  ])("%s es %s", (token, day) => {
    const result = parse(`Pintar ${token}`);
    expect(result.plannedDate).toBe(day);
    expect(result.title).toBe("Pintar");
  });

  it("el dia de la semana de hoy es el de la semana que viene", () => {
    expect(parse("Pintar @mie").plannedDate).toBe("2026-10-21");
    expect(parse("Pintar @miércoles").plannedDate).toBe("2026-10-21");
  });

  it("lee una fecha sin año como la proxima vez que llega", () => {
    expect(parse("Pintar @15/10").plannedDate).toBe("2026-10-15");
    expect(parse("Pintar @14/10").plannedDate).toBe("2026-10-14");
    expect(parse("Pintar @3/1").plannedDate).toBe("2027-01-03");
  });

  it("lee una fecha con año", () => {
    expect(parse("Pintar @3/1/2027").plannedDate).toBe("2027-01-03");
    expect(parse("Pintar @3/1/27").plannedDate).toBe("2027-01-03");
  });

  it("deja en el titulo una fecha que no existe", () => {
    const result = parse("Pintar @31/2");
    expect(result.plannedDate).toBeNull();
    expect(result.title).toBe("Pintar @31/2");
  });

  it("ancla la hora que va justo detras", () => {
    expect(parse("Llamar @mañana 9:30")).toMatchObject({
      title: "Llamar",
      plannedDate: "2026-10-15",
      startMinute: 570,
    });
  });

  it("lee «@10:00» como hoy a esa hora", () => {
    expect(parse("Llamar @10:00")).toMatchObject({
      plannedDate: "2026-10-14",
      startMinute: 600,
    });
  });

  it("no ancla una hora que no va detras del dia", () => {
    const result = parse("Llamar 9:30 @mañana");
    expect(result.startMinute).toBeNull();
    expect(result.title).toBe("Llamar 9:30");
  });

  it("no ancla una hora imposible", () => {
    const result = parse("Llamar @hoy 25:00");
    expect(result.startMinute).toBeNull();
    expect(result.title).toBe("Llamar 25:00");
  });

  it("nunca pone vencimiento", () => {
    expect(parse("Pintar @vie").dueDate).toBeNull();
  });

  it("deja una mencion en el titulo", () => {
    expect(parse("Hablar con @ana").title).toBe("Hablar con @ana");
  });

  it("se queda con el ultimo dia si hay dos", () => {
    expect(parse("Pintar @hoy @vie").plannedDate).toBe("2026-10-16");
  });
});

describe("parseQuickAdd: vencimiento", () => {
  it("lee el vencimiento sin tocar el plan", () => {
    expect(parse("Entregar informe !vie")).toMatchObject({
      title: "Entregar informe",
      dueDate: "2026-10-16",
      plannedDate: null,
    });
  });

  it("admite plan y vencimiento a la vez", () => {
    expect(parse("Entregar !15/10 @hoy")).toMatchObject({
      dueDate: "2026-10-15",
      plannedDate: "2026-10-14",
    });
  });

  it("deja una exclamacion normal en el titulo", () => {
    expect(parse("Cuidado ! con esto!").title).toBe("Cuidado ! con esto!");
  });
});

describe("parseQuickAdd: etiquetas, proyecto y prioridad", () => {
  it("lee etiquetas existentes sin distinguir mayusculas", () => {
    const result = parse("Responder #urgente #CLIENTE");
    expect(result.labels).toEqual([
      { id: "l-urg", name: "Urgente" },
      { id: "l-cli", name: "Cliente" },
    ]);
    expect(result.title).toBe("Responder");
  });

  it("escribe los espacios del nombre con guion", () => {
    expect(parse("Pedido #en-espera").labels).toEqual([
      { id: "l-esp", name: "En espera" },
    ]);
  });

  it("deja en el titulo una etiqueta que no existe", () => {
    const result = parse("Revisar #42");
    expect(result.labels).toEqual([]);
    expect(result.title).toBe("Revisar #42");
  });

  it("no repite una etiqueta", () => {
    expect(parse("Algo #urgente #Urgente").labels).toHaveLength(1);
  });

  it("lee el proyecto por su clave", () => {
    expect(parse("Medir cuadro +obr").project).toEqual({
      id: "p-obr",
      slug: "OBR",
      name: "Obra Norte",
    });
  });

  it("deja en el titulo una clave que no existe", () => {
    const result = parse("Sumar +1 al pedido");
    expect(result.project).toBeNull();
    expect(result.title).toBe("Sumar +1 al pedido");
  });

  it.each([
    ["*urgente", "urgent"],
    ["*u", "urgent"],
    ["*alta", "high"],
    ["*a", "high"],
    ["*media", "medium"],
    ["*baja", "low"],
  ])("lee la prioridad %s", (token, priority) => {
    expect(parse(`Revisar ${token}`).priority).toBe(priority);
  });

  it("deja un asterisco normal en el titulo", () => {
    expect(parse("Nota *importante*").title).toBe("Nota *importante*");
  });
});

describe("parseQuickAdd: literal y combinado", () => {
  it("la barra invertida deja la palabra tal cual", () => {
    const result = parse("Comprar \\@hoy y \\1h \\#urgente");
    expect(result.title).toBe("Comprar @hoy y 1h #urgente");
    expect(result.plannedDate).toBeNull();
    expect(result.estimate).toBeNull();
    expect(result.labels).toEqual([]);
  });

  it("una barra invertida sola se queda", () => {
    expect(parse("a \\ b").title).toBe("a \\ b");
  });

  it("lo lee todo junto, en cualquier orden", () => {
    expect(
      parse("*alta Revisar presupuesto +MAN @lun 8:15 1h30 !vie #cliente"),
    ).toEqual({
      title: "Revisar presupuesto",
      estimate: 5400,
      plannedDate: "2026-10-19",
      startMinute: 495,
      dueDate: "2026-10-16",
      labels: [{ id: "l-cli", name: "Cliente" }],
      project: { id: "p-man", slug: "MAN", name: "Mantenimiento" },
      priority: "high",
    });
  });
});

// Revision de codigo del interludio, hallazgo 9: los diccionarios son objetos
// llanos, y `in` o `[...]` casaban con lo que heredan de Object.prototype.
describe("parseQuickAdd: palabras que no son tokens", () => {
  it("deja en el titulo lo que solo casa con propiedades heredadas", () => {
    for (const word of [
      "@constructor",
      "!constructor",
      "*constructor",
      "@__proto__",
      "*tostring",
    ]) {
      expect(parse(`Revisar ${word}`)).toMatchObject({
        title: `Revisar ${word}`,
        plannedDate: null,
        dueDate: null,
        priority: null,
      });
    }
  });
});

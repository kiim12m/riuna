import { describe, expect, it } from "vitest";
import {
  parseFieldConfig,
  slugifyFieldKey,
} from "../../../apps/api/src/field/field-types";
import {
  applyFieldValues,
  assertRequiredFieldsPresent,
  type FieldDefinitionLike,
  FieldValidationError,
} from "../../../apps/api/src/field/validate-field-values";

function define(
  overrides: Partial<FieldDefinitionLike> & Pick<FieldDefinitionLike, "type">,
): FieldDefinitionLike {
  return {
    key: overrides.key ?? "campo",
    name: overrides.name ?? "Campo",
    required: overrides.required ?? false,
    config: overrides.config ?? {},
    type: overrides.type,
  };
}

function apply(
  definitions: FieldDefinitionLike[],
  incoming: Record<string, unknown>,
  current: Record<string, unknown> = {},
) {
  return applyFieldValues({ definitions, current, incoming });
}

describe("applyFieldValues", () => {
  it("rejects a key with no definition behind it", () => {
    expect(() => apply([], { inventado: "x" })).toThrow(FieldValidationError);
  });

  it("keeps the values the request did not mention", () => {
    const definitions = [define({ key: "cliente", type: "text" })];

    const result = apply(
      definitions,
      { cliente: "LEROY" },
      {
        cliente: "BAUHAUS",
        otro_campo_ya_guardado: 42,
      },
    );

    expect(result).toEqual({
      cliente: "LEROY",
      otro_campo_ya_guardado: 42,
    });
  });

  // Un campo vaciado se borra en vez de guardarse como null: si no, el JSONB
  // acumula lapidas de cada campo que alguien lleno una vez.
  it("deletes the key instead of storing null when a value is cleared", () => {
    const definitions = [define({ key: "cliente", type: "text" })];

    for (const cleared of [null, undefined, ""]) {
      const result = apply(
        definitions,
        { cliente: cleared },
        {
          cliente: "BAUHAUS",
        },
      );
      expect(result).toEqual({});
    }
  });

  it("refuses to clear a required field", () => {
    const definitions = [
      define({ key: "cliente", type: "text", required: true }),
    ];

    expect(() => apply(definitions, { cliente: null })).toThrow(/is required/);
  });

  describe("por tipo", () => {
    it("text respects the configured maximum length", () => {
      const definitions = [
        define({ key: "nota", type: "text", config: { maxLength: 5 } }),
      ];

      expect(apply(definitions, { nota: "corto" })).toEqual({ nota: "corto" });
      expect(() => apply(definitions, { nota: "demasiado largo" })).toThrow(
        FieldValidationError,
      );
    });

    it("number rejects text, infinities and out-of-range values", () => {
      const definitions = [
        define({
          key: "cantidad",
          type: "number",
          config: { min: 0, max: 10 },
        }),
      ];

      expect(apply(definitions, { cantidad: 5 })).toEqual({ cantidad: 5 });
      expect(() => apply(definitions, { cantidad: "5" })).toThrow(
        FieldValidationError,
      );
      expect(() => apply(definitions, { cantidad: Number.NaN })).toThrow(
        FieldValidationError,
      );
      expect(() =>
        apply(definitions, { cantidad: Number.POSITIVE_INFINITY }),
      ).toThrow(FieldValidationError);
      expect(() => apply(definitions, { cantidad: 11 })).toThrow(
        FieldValidationError,
      );
      expect(() => apply(definitions, { cantidad: -1 })).toThrow(
        FieldValidationError,
      );
    });

    it("select only accepts one of its own options", () => {
      const definitions = [
        define({
          key: "fase",
          type: "select",
          config: {
            options: [
              { value: "obra", label: "Obra" },
              { value: "oficina", label: "Oficina" },
            ],
          },
        }),
      ];

      expect(apply(definitions, { fase: "obra" })).toEqual({ fase: "obra" });
      expect(() => apply(definitions, { fase: "taller" })).toThrow(
        /not one of the field's options/,
      );
    });

    it("multi_select rejects unknown and repeated options", () => {
      const definitions = [
        define({
          key: "etiquetas",
          type: "multi_select",
          config: {
            options: [
              { value: "obra", label: "Obra" },
              { value: "carpa", label: "Carpa" },
            ],
          },
        }),
      ];

      expect(apply(definitions, { etiquetas: ["obra", "carpa"] })).toEqual({
        etiquetas: ["obra", "carpa"],
      });
      expect(() =>
        apply(definitions, { etiquetas: ["obra", "taller"] }),
      ).toThrow(FieldValidationError);
      expect(() => apply(definitions, { etiquetas: ["obra", "obra"] })).toThrow(
        /cannot be selected twice/,
      );
    });

    it("date demands YYYY-MM-DD and a day that exists", () => {
      const definitions = [define({ key: "revision", type: "date" })];

      expect(apply(definitions, { revision: "2026-08-27" })).toEqual({
        revision: "2026-08-27",
      });
      expect(() => apply(definitions, { revision: "27/08/2026" })).toThrow(
        /YYYY-MM-DD/,
      );
      // El 30 de febrero pasa la regex y no existe.
      expect(() => apply(definitions, { revision: "2026-02-30" })).toThrow(
        /does not exist/,
      );
    });

    it("checkbox takes a boolean and not a truthy string", () => {
      const definitions = [define({ key: "urgente", type: "checkbox" })];

      expect(apply(definitions, { urgente: false })).toEqual({
        urgente: false,
      });
      expect(() => apply(definitions, { urgente: "true" })).toThrow(
        FieldValidationError,
      );
    });

    it("url only accepts http and https", () => {
      const definitions = [define({ key: "plano", type: "url" })];

      expect(
        apply(definitions, { plano: "https://ejemplo.com/a.pdf" }),
      ).toEqual({ plano: "https://ejemplo.com/a.pdf" });
      expect(() =>
        apply(definitions, { plano: "javascript:alert(1)" }),
      ).toThrow(FieldValidationError);
      expect(() => apply(definitions, { plano: "no es una url" })).toThrow(
        FieldValidationError,
      );
    });

    // El caso que justifica que la relacion tenga tipo pero no valor aqui.
    it("refuses to store a value for a relation field", () => {
      const definitions = [
        define({ key: "cliente", name: "Cliente", type: "relation" }),
      ];

      expect(() => apply(definitions, { cliente: "task-123" })).toThrow(
        /lives in task relations/,
      );
    });
  });

  it("names the offending field so the UI can point at it", () => {
    const definitions = [
      define({ key: "cantidad", name: "Cantidad", type: "number" }),
    ];

    try {
      apply(definitions, { cantidad: "muchas" });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FieldValidationError);
      expect((error as FieldValidationError).key).toBe("cantidad");
      expect((error as FieldValidationError).message).toContain("Cantidad");
    }
  });
});

describe("assertRequiredFieldsPresent", () => {
  it("passes when every required field carries a value", () => {
    const definitions = [
      define({ key: "cliente", type: "text", required: true }),
      define({ key: "nota", type: "text" }),
    ];

    expect(() =>
      assertRequiredFieldsPresent({
        definitions,
        values: { cliente: "BAUHAUS" },
      }),
    ).not.toThrow();
  });

  it("fails when a required field is missing", () => {
    const definitions = [
      define({ key: "cliente", name: "Cliente", type: "text", required: true }),
    ];

    expect(() =>
      assertRequiredFieldsPresent({ definitions, values: {} }),
    ).toThrow(/Cliente/);
  });

  // Un campo de relacion obligatorio no puede exigirse aqui: su valor no vive
  // en el JSONB, asi que mirarlo aqui lo daria por ausente siempre.
  it("ignores relation fields, whose value lives elsewhere", () => {
    const definitions = [
      define({ key: "cliente", type: "relation", required: true }),
    ];

    expect(() =>
      assertRequiredFieldsPresent({ definitions, values: {} }),
    ).not.toThrow();
  });
});

describe("parseFieldConfig", () => {
  it("requires a select to carry at least one option", () => {
    expect(() => parseFieldConfig("select", { options: [] })).toThrow(
      /at least one option/,
    );
  });

  it("rejects options that share a value", () => {
    expect(() =>
      parseFieldConfig("select", {
        options: [
          { value: "obra", label: "Obra" },
          { value: "obra", label: "Obra bis" },
        ],
      }),
    ).toThrow(/unique/);
  });

  it("rejects a number range that is inside out", () => {
    expect(() => parseFieldConfig("number", { min: 10, max: 1 })).toThrow(
      /min must not be greater than max/,
    );
  });

  it("demands an ISO 4217 code for a currency field", () => {
    expect(parseFieldConfig("currency", { currency: "EUR" })).toEqual({
      currency: "EUR",
    });
    expect(() => parseFieldConfig("currency", { currency: "euros" })).toThrow(
      /ISO 4217/,
    );
  });

  // Lo que se guarda es solo lo que el tipo entiende, para que `config` no
  // acumule claves de un tipo que el campo tuvo antes.
  it("drops keys the type does not understand", () => {
    expect(parseFieldConfig("checkbox", { options: [1, 2, 3] })).toEqual({});
  });
});

describe("slugifyFieldKey", () => {
  it("builds a stable key out of a display name", () => {
    expect(slugifyFieldKey("Presupuesto anual")).toBe("presupuesto_anual");
    expect(slugifyFieldKey("Número de expediente")).toBe(
      "numero_de_expediente",
    );
    expect(slugifyFieldKey("  ¿Revisado?  ")).toBe("revisado");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugifyFieldKey("€€€")).toBe("");
  });
});

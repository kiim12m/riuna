import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges tailwind classes and resolves conflicts", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  /**
   * La escala tipografica dentro de `cn()`.
   *
   * tailwind-merge clasifica `text-*` por su valor: si no reconoce una escala
   * de tamano, asume **color**. Los siete papeles de `marca.md` §05 son nombres
   * propios (`label`, `meta`, `section`…), asi que sin configurarlo caian en el
   * mismo grupo que `text-muted-foreground` y desaparecian en cuanto un
   * elemento llevaba las dos cosas — que es lo que hace cada chip de estado y
   * cada titulo de tarea cerrada.
   *
   * El fallo no da error: el elemento hereda 16 px y se ve casi bien.
   */
  describe("escala tipografica", () => {
    const COLORES = [
      "text-muted-foreground",
      "text-destructive-foreground",
      "text-warning-foreground",
      "text-foreground",
    ];

    const TAMANOS = [
      "text-display",
      "text-page",
      "text-section",
      "text-body",
      "text-meta",
      "text-label",
      "text-mono",
    ];

    it("conserva tamano y color juntos: no compiten por el mismo grupo", () => {
      for (const tamano of TAMANOS) {
        for (const color of COLORES) {
          const salida = cn(tamano, color);

          expect(salida, `${tamano} + ${color}`).toContain(tamano);
          expect(salida, `${tamano} + ${color}`).toContain(color);
        }
      }
    });

    it("da igual el orden", () => {
      expect(cn("text-muted-foreground", "text-label")).toContain("text-label");
      expect(cn("text-label", "text-muted-foreground")).toContain("text-label");
    });

    it("sigue quedandose con el ultimo tamano cuando hay dos", () => {
      expect(cn("text-body", "text-label")).toBe("text-label");
      expect(cn("text-label", "text-meta")).toBe("text-meta");
    });

    it("sigue quedandose con el ultimo color cuando hay dos", () => {
      expect(cn("text-foreground", "text-muted-foreground")).toBe(
        "text-muted-foreground",
      );
    });

    it("no rompe las clases de tamano de Tailwind", () => {
      expect(cn("text-sm", "text-lg")).toBe("text-lg");
      expect(cn("text-sm", "text-muted-foreground")).toContain("text-sm");
    });
  });
});

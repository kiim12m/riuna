// La jerarquia viaja en una tabla plana como numeracion de esquema: `1`, `1.1`,
// `1.1.2`. Ver la ADR 017.
//
// La numeracion tiene dos filos conocidos —insertar obliga a renumerar, y un
// numero mal escrito reparentaria en silencio— y este modulo los acota con
// reglas explicitas en vez de con un segundo mecanismo:
//
//  1. El padre de una fila es la fila anterior mas cercana cuyo esquema tenga
//     exactamente un segmento menos y sea prefijo del suyo. Esquema vacio =
//     raiz.
//  2. Un esquema repetido en el fichero es un error, y se nombran las filas.
//  3. Si el padre implicito no esta en el fichero, no se mueve nada: quien
//     decide es quien llama, sabiendo si la fila ya existe en Riuna.
//  4. La profundidad final la comprueba quien llama con `rejectReparent`, que
//     es quien conoce el padre real y el limite del proyecto.
//
// Es puro a proposito: los casos raros de una numeracion —saltos de nivel,
// duplicados, basura— se recorren sin base de datos delante.

const SEGMENT = /^\d+$/;

export type OutlineRow = {
  /** Posicion de la fila entre las de datos, empezando en 0. */
  index: number;
  /** El valor de la celda `Esquema`, tal cual. */
  outline: string;
};

export type OutlineIssue =
  /** El mismo esquema en dos filas: no se adivina cual gana. */
  | { kind: "duplicate"; outline: string; indexes: number[] }
  /** No es una numeracion: `1.a`, `primero`, `1..2`. */
  | { kind: "invalid"; index: number; outline: string }
  /** Regla 3: el esquema dice que cuelga de algo que no esta en el fichero. */
  | { kind: "orphan"; index: number; outline: string; parentOutline: string };

export type OutlineResolution = {
  index: number;
  /** Fila del fichero de la que cuelga, o `null` si es raiz. */
  parentIndex: number | null;
  /** Cierto cuando el padre que el esquema nombra no esta en el fichero. */
  parentMissing: boolean;
  /** Niveles por encima dentro del fichero. Una raiz es 0. */
  depthInFile: number;
};

export type OutlineResult = {
  resolutions: OutlineResolution[];
  issues: OutlineIssue[];
};

/**
 * Normaliza el valor de la celda a segmentos. Devuelve `null` si no es una
 * numeracion utilizable.
 *
 * Tolera lo que una hoja de calculo produce sola: espacios, un punto final
 * ("1.2.") y el numero suelto que Excel escribe cuando la celda tiene formato
 * numerico. Lo que **no** hace es adivinar: `1,2` no es `1.2`, porque en una
 * hoja espanola esa coma es un decimal y aceptarla convertiria un numero mal
 * tecleado en una jerarquia inventada.
 */
export function parseOutline(raw: string): string[] | null {
  const trimmed = raw.trim().replace(/\.+$/, "");

  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split(".");

  if (segments.some((segment) => !SEGMENT.test(segment))) {
    return null;
  }

  return segments;
}

/** `1.2.3` a partir de sus segmentos. */
export function formatOutline(segments: readonly number[]): string {
  return segments.join(".");
}

function isPrefix(parent: string[], child: string[]): boolean {
  if (parent.length !== child.length - 1) {
    return false;
  }
  return parent.every((segment, position) => segment === child[position]);
}

/**
 * Resuelve la jerarquia que el fichero describe.
 *
 * Una fila cuyo esquema no se entiende, o que esta repetido, se resuelve como
 * raiz y ademas deja constancia en `issues`: el informe la senala, pero una
 * numeracion rota no puede tumbar la importacion entera de 5.000 filas.
 */
export function resolveOutline(rows: readonly OutlineRow[]): OutlineResult {
  const issues: OutlineIssue[] = [];
  const parsed = new Map<number, string[]>();

  // Un esquema por fila, y la lista de filas por esquema para detectar repetidos.
  const indexesByOutline = new Map<string, number[]>();

  for (const row of rows) {
    const segments = parseOutline(row.outline);

    if (!segments) {
      if (row.outline.trim()) {
        issues.push({
          kind: "invalid",
          index: row.index,
          outline: row.outline.trim(),
        });
      }
      continue;
    }

    parsed.set(row.index, segments);

    const canonical = segments.join(".");
    const existing = indexesByOutline.get(canonical);
    if (existing) {
      existing.push(row.index);
    } else {
      indexesByOutline.set(canonical, [row.index]);
    }
  }

  // El duplicado se declara una vez, con todas las filas implicadas. Ninguna se
  // usa como madre de nada: apuntar a una de las dos seria elegir al azar.
  const duplicated = new Set<string>();
  for (const [outline, indexes] of indexesByOutline) {
    if (indexes.length > 1) {
      duplicated.add(outline);
      issues.push({ kind: "duplicate", outline, indexes: [...indexes] });
    }
  }

  const resolutions: OutlineResolution[] = [];
  const depthByIndex = new Map<number, number>();
  // Filas ya vistas con su esquema, en orden, para buscar la madre hacia atras.
  const seen: Array<{ index: number; segments: string[] }> = [];

  for (const row of rows) {
    const segments = parsed.get(row.index);
    const canonical = segments?.join(".");

    if (!segments || (canonical && duplicated.has(canonical))) {
      resolutions.push({
        index: row.index,
        parentIndex: null,
        parentMissing: false,
        depthInFile: 0,
      });
      depthByIndex.set(row.index, 0);
      continue;
    }

    if (segments.length === 1) {
      resolutions.push({
        index: row.index,
        parentIndex: null,
        parentMissing: false,
        depthInFile: 0,
      });
      depthByIndex.set(row.index, 0);
      seen.push({ index: row.index, segments });
      continue;
    }

    // Hacia atras: la madre es la ultima fila con un segmento menos que sea
    // prefijo. Exigir "un segmento menos" y no "cualquier prefijo" es lo que
    // impide que un `1.1.1.1` sin `1.1.1` delante se cuelgue de `1.1`
    // promocionandose dos niveles sin que nadie lo note.
    let parentIndex: number | null = null;
    for (let position = seen.length - 1; position >= 0; position -= 1) {
      const candidate = seen[position];
      if (candidate && isPrefix(candidate.segments, segments)) {
        parentIndex = candidate.index;
        break;
      }
    }

    if (parentIndex === null) {
      const parentOutline = segments.slice(0, -1).join(".");
      issues.push({
        kind: "orphan",
        index: row.index,
        outline: canonical ?? segments.join("."),
        parentOutline,
      });
    }

    const parentDepth =
      parentIndex === null ? -1 : (depthByIndex.get(parentIndex) ?? -1);
    const depthInFile = parentDepth + 1;

    resolutions.push({
      index: row.index,
      parentIndex,
      parentMissing: parentIndex === null,
      depthInFile,
    });
    depthByIndex.set(row.index, depthInFile);

    seen.push({ index: row.index, segments });
  }

  return { resolutions, issues };
}

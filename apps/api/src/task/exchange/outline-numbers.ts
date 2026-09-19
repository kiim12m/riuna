import { TASK_PATH_SEPARATOR } from "../tree";

// Numeracion de esquema para el fichero exportado.
//
// El caso que decide el diseno es exportar una **vista filtrada**: el resultado
// puede traer `1.1.1` sin su madre. La numeracion se calcula sobre el camino
// completo de cada tarea —los ancestros ausentes tambien reciben su numero,
// aunque no salgan como fila—, de modo que:
//
//  - una fila cuya madre si sale queda con un segmento mas que ella y con su
//    prefijo, que es lo que la regla 1 del importador necesita;
//  - una fila cuya madre no sale queda huerfana al reimportar, y el importador
//    le conserva la madre que ya tiene en vez de promoverla a raiz.
//
// Es la regla 4 de la ADR 017, y sin ella reimportar una vista filtrada
// aplanaria el arbol en silencio.

export type OutlineTask = {
  id: string;
  /** `/raiz/hija/nieta/` */
  path: string;
  position: number | null;
  number: number | null;
};

/**
 * Numero de esquema de cada tarea devuelta, por identificador.
 *
 * Las hermanas se ordenan por `position` y, a igualdad, por `number`, que es el
 * mismo criterio con el que se pintan. Un ancestro que no viene en el resultado
 * se numera por orden de aparicion, detras de las que si vienen: no sale como
 * fila, solo ocupa su nivel.
 */
export function assignOutlineNumbers(
  tasks: readonly OutlineTask[],
): Map<string, string> {
  const present = new Map(tasks.map((task) => [task.id, task]));

  // Hijas por madre, incluidos los ancestros que no vienen en el resultado.
  const childrenByParent = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const task of tasks) {
    const segments = task.path.split(TASK_PATH_SEPARATOR).filter(Boolean);

    for (let index = 0; index < segments.length; index += 1) {
      const id = segments[index] as string;
      if (seen.has(id)) continue;
      seen.add(id);

      const parent = index === 0 ? "" : (segments[index - 1] as string);
      const siblings = childrenByParent.get(parent);
      if (siblings) siblings.push(id);
      else childrenByParent.set(parent, [id]);
    }
  }

  const numberById = new Map<string, number>();

  for (const siblings of childrenByParent.values()) {
    const ordered = [...siblings].sort((left, right) => {
      const a = present.get(left);
      const b = present.get(right);

      // Las ausentes van detras: no se pintan, y asi no desplazan a las que si.
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;

      return (
        (a.position ?? 0) - (b.position ?? 0) ||
        (a.number ?? 0) - (b.number ?? 0)
      );
    });

    ordered.forEach((id, index) => {
      numberById.set(id, index + 1);
    });
  }

  const outlineById = new Map<string, string>();

  for (const task of tasks) {
    const segments = task.path.split(TASK_PATH_SEPARATOR).filter(Boolean);
    outlineById.set(
      task.id,
      segments.map((id) => numberById.get(id) ?? 1).join("."),
    );
  }

  return outlineById;
}

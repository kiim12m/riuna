import { useCallback, useEffect, useState } from "react";
import { type GroupByField, isGroupByField } from "@/lib/group-tasks";

const DEFAULT_GROUP_BY: GroupByField = "status";

function readStored(storageKey: string | null): GroupByField {
  if (!storageKey || typeof window === "undefined") return DEFAULT_GROUP_BY;

  try {
    const stored = window.localStorage.getItem(storageKey);
    return isGroupByField(stored) ? stored : DEFAULT_GROUP_BY;
  } catch {
    return DEFAULT_GROUP_BY;
  }
}

function writeStored(storageKey: string | null, groupBy: GroupByField) {
  if (!storageKey || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, groupBy);
  } catch {
    // persistence is best-effort; private mode or quota can block writes
  }
}

/**
 * La agrupacion se recuerda por proyecto, como el orden: es una preferencia de
 * lectura de quien mira, no un ajuste del proyecto, asi que vive en el
 * navegador y no viaja al servidor. Las vistas de lista y el backlog comparten
 * clave a proposito: son el mismo «como quiero leer este proyecto».
 *
 * Se escribe al cambiar, no en un efecto que dependa del valor: con un efecto
 * de escritura, el primer render lo dispara con el valor inicial y pisa lo
 * guardado antes de que el de lectura llegue a aplicarse. El valor guardado se
 * lee en la inicializacion perezosa, asi que el primer render ya es el bueno y
 * la lista no parpadea de un agrupamiento a otro.
 */
export function useTaskGrouping(projectId: string | undefined) {
  const storageKey = projectId ? `riuna:task-group:${projectId}` : null;
  const [groupBy, setGroupBy] = useState<GroupByField>(() =>
    readStored(storageKey),
  );

  // Cambiar de proyecto sin desmontar el componente tiene que traer la
  // preferencia del proyecto nuevo.
  useEffect(() => {
    setGroupBy(readStored(storageKey));
  }, [storageKey]);

  const changeGroupBy = useCallback(
    (next: GroupByField) => {
      setGroupBy(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );

  return { groupBy, setGroupBy: changeGroupBy };
}

export default useTaskGrouping;

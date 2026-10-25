/**
 * Entre que dos tareas cae una que se suelta sobre `overId`, que es otra tarea
 * o la propia lista. Dentro de la misma lista, bajando cae detras de la tarea
 * sobre la que se suelta y subiendo, delante; desde otra lista, detras; sobre
 * la lista, al final. `null` si no se mueve: soltada sobre si misma.
 */
export function dropNeighbours(
  tasks: { id: string }[],
  activeId: string,
  overId: string,
): { afterId: string | null; beforeId: string | null } | null {
  if (overId === activeId) return null;

  const sourceIndex = tasks.findIndex((task) => task.id === activeId);
  const rest = tasks.filter((task) => task.id !== activeId);
  const overIndex = rest.findIndex((task) => task.id === overId);

  const index =
    overIndex < 0
      ? rest.length
      : sourceIndex >= 0 && sourceIndex > overIndex
        ? overIndex
        : overIndex + 1;

  return {
    afterId: rest[index - 1]?.id ?? null,
    beforeId: rest[index]?.id ?? null,
  };
}

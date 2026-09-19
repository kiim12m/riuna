import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";

/**
 * La rejilla del panel: tres columnas y un `span` de una a tres.
 *
 * No entra `react-grid-layout`: una rejilla libre de arrastrar y redimensionar
 * es una dependencia nueva para un grado de libertad que el criterio de
 * aceptacion no pide. Con dnd-kit —que ya reordena los proyectos de la pagina
 * de inicio— y un ancho enumerado se monta el mismo panel.
 */
export function DashboardGrid({
  ids,
  onReorder,
  disabled = false,
  children,
}: {
  ids: string[];
  onReorder: (ids: string[]) => void;
  /** Sin arrastre: el panel es de otra persona y la API no deja reordenarlo. */
  disabled?: boolean;
  children: ReactNode;
}) {
  const sensors = useSensors(
    // Por debajo de estos umbrales el gesto sigue siendo un clic en el menu del
    // widget y la pagina sigue haciendo scroll.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    document.body.classList.remove("riuna-dragging");

    if (!over || active.id === over.id) return;

    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    onReorder(arrayMove(ids, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragStart={() => document.body.classList.add("riuna-dragging")}
      onDragEnd={handleDragEnd}
      onDragCancel={() => document.body.classList.remove("riuna-dragging")}
    >
      <SortableContext
        items={ids}
        strategy={rectSortingStrategy}
        disabled={disabled}
      >
        <div className="grid grid-cols-1 gap-(--density-col-gap) sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function SortableWidget({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id,
    animateLayoutChanges: () => false,
    transition: { duration: 200, easing: "var(--ease-out)" },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isSorting ? transition : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-riuna-sortable=""
      className={isDragging ? "relative z-10 opacity-90 shadow-e2" : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

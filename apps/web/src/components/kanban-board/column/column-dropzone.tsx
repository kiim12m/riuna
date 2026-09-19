import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { ProjectWithTasks } from "@/types/project";
import TaskCard from "../task-card";

type ColumnDropzoneProps = {
  column: ProjectWithTasks["columns"][number];
  disableDragDrop?: boolean;
  onIsOverChange?: (isOver: boolean) => void;
};

export function ColumnDropzone({
  column,
  disableDragDrop = false,
  onIsOverChange,
}: ColumnDropzoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      column,
    },
  });

  useEffect(() => {
    onIsOverChange?.(isOver);
  }, [isOver, onIsOverChange]);

  const reduceMotion = useReducedMotion();

  // El escalonado solo se aplica en el primer montaje de la columna (una carga
  // de vista). Las tarjetas que llegan despues entran sin retardo. Ver ADR 021.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);

  return (
    <div ref={setNodeRef} className="flex-1 min-h-0">
      <SortableContext
        items={column.tasks}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-(--density-col-gap)">
          <AnimatePresence mode="popLayout">
            {column.tasks.map((task, index) => (
              <motion.div
                key={task.id}
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 6, scale: 0.985 }
                }
                animate={
                  reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
                }
                exit={
                  reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }
                }
                transition={{
                  duration: reduceMotion ? 0.15 : 0.22,
                  ease: [0.25, 1, 0.5, 1],
                  delay:
                    mounted.current || reduceMotion
                      ? 0
                      : Math.min(index, 8) * 0.038,
                }}
              >
                <TaskCard task={task} disableDragDrop={disableDragDrop} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>
    </div>
  );
}

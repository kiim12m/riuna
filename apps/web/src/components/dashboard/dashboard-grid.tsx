import {
  closestCorners,
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
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

/** Las columnas de la rejilla invisible. Doce divide por 2, 3, 4 y 6. */
export const PANEL_COLUMNS = 12;
/** El alto maximo de un widget, en filas de `--panel-row`. */
export const PANEL_MAX_ROWS = 6;

/**
 * Los anchos que ofrece el editor. No 1-12 libre: doce opciones en un
 * desplegable son ruido, y un ancho que no divide doce deja la fila desigual.
 */
export const PANEL_WIDTHS = [3, 4, 6, 8, 12];

/**
 * El ancho en la rejilla intermedia (40-64rem): cada widget dobla su fraccion,
 * hasta la fila entera. Pura, para que la hoja de estilos no calcule nada.
 */
export function spanForMedium(span: number): number {
  return span <= 6 ? span * 2 : PANEL_COLUMNS;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * La rejilla del panel: doce columnas invisibles, ancho y alto por widget.
 *
 * Sustituye a la rejilla de tres columnas con `span` enumerado que monto la
 * ADR 030. Sigue sin entrar `react-grid-layout`: lo que hacia falta era una
 * celda mas fina y un alto declarado, no colocacion libre con huecos —que
 * ademas obligaria a guardar una distribucion por tamaño de pantalla—. Ver
 * ADR 043.
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
      // `closestCorners` y no `closestCenter`: con celdas de tamaños dispares
      // el centro de una tira de doce columnas queda lejos de todo, y apuntarla
      // se volvia cuestion de suerte.
      collisionDetection={closestCorners}
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
        <div className="riuna-panel-grid">{children}</div>
      </SortableContext>
    </DndContext>
  );
}

export function SortableWidget({
  id,
  span,
  rowSpan,
  canResize = false,
  onResize,
  children,
}: {
  id: string;
  span: number;
  rowSpan: number;
  canResize?: boolean;
  /**
   * Devuelve una promesa que **rechaza** si el servidor no acepta el tamaño;
   * es lo que permite deshacer la vista previa en vez de dejar la tarjeta
   * dibujada a una medida que no se guardo.
   */
  onResize?: (size: { span: number; rowSpan: number }) => Promise<unknown>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const {
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

  const cellRef = useRef<HTMLDivElement | null>(null);
  // El tamaño mientras se arrastra el tirador. La rejilla se recoloca sola con
  // cambiar las custom properties: no hay que mover nada a mano.
  const [preview, setPreview] = useState<{
    span: number;
    rowSpan: number;
  } | null>(null);

  // Soltar la vista previa cuando el servidor confirma el mismo tamaño. Las
  // mutaciones invalidan, no escriben en optimista, asi que sin esto la tarjeta
  // parpadeaba a su tamaño anterior antes de llegar el nuevo.
  useEffect(() => {
    if (preview && preview.span === span && preview.rowSpan === rowSpan) {
      setPreview(null);
    }
  }, [preview, span, rowSpan]);

  const shownSpan = preview?.span ?? span;
  const shownRowSpan = preview?.rowSpan ?? rowSpan;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isSorting ? transition : undefined,
    "--panel-w": String(shownSpan),
    "--panel-w-md": String(spanForMedium(shownSpan)),
    "--panel-h": String(shownRowSpan),
  } as CSSProperties;

  const startResize = (event: ReactPointerEvent) => {
    const cell = cellRef.current;
    const grid = cell?.parentElement;
    if (!cell || !grid) return;

    event.preventDefault();
    event.stopPropagation();

    // La geometria de la celda sale de la propia tarjeta: su ancho es
    // `w*celda + (w-1)*hueco`, asi que despejar da la celda sin medir la
    // rejilla ni montar un ResizeObserver.
    // Contra `shownSpan`/`shownRowSpan` y no contra las props: si hay un
    // redimensionado anterior todavia sin confirmar, el rectangulo medido es el
    // de la vista previa y dividirlo por el tamaño viejo daba una celda
    // equivocada, asi que el gesto saltaba de golpe.
    const rect = cell.getBoundingClientRect();
    const styles = getComputedStyle(grid);
    const colGap = Number.parseFloat(styles.columnGap) || 0;
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    const cellWidth = (rect.width - (shownSpan - 1) * colGap) / shownSpan;
    const cellHeight =
      (rect.height - (shownRowSpan - 1) * rowGap) / shownRowSpan;

    const originX = event.clientX;
    const originY = event.clientY;
    const from = { span: shownSpan, rowSpan: shownRowSpan };
    let next = { ...from };

    const sizeAt = (clientX: number, clientY: number) => ({
      span: clamp(
        from.span + Math.round((clientX - originX) / (cellWidth + colGap)),
        1,
        PANEL_COLUMNS,
      ),
      rowSpan: clamp(
        from.rowSpan + Math.round((clientY - originY) / (cellHeight + rowGap)),
        1,
        PANEL_MAX_ROWS,
      ),
    });

    const move = (moveEvent: PointerEvent) => {
      next = sizeAt(moveEvent.clientX, moveEvent.clientY);
      setPreview(next);
    };

    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);

      const unchanged =
        next.span === from.span && next.rowSpan === from.rowSpan;
      if (upEvent.type === "pointercancel" || unchanged) {
        setPreview(null);
        return;
      }

      commit(next);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  /**
   * Envia el tamaño y deja la vista previa puesta hasta que el servidor
   * confirma. Si lo rechaza se deshace: sin esto la tarjeta se quedaba
   * dibujada a una medida que nadie habia guardado, y solo recargando volvia.
   */
  const commit = (size: { span: number; rowSpan: number }) => {
    setPreview(size);
    onResize?.(size)?.catch(() => setPreview(null));
  };

  const nudge = (event: ReactKeyboardEvent) => {
    const deltas: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const delta = deltas[event.key];
    if (!delta) return;

    event.preventDefault();
    event.stopPropagation();

    // Desde lo que se esta viendo: contra las props, dos pulsaciones seguidas
    // mandaban dos veces el mismo tamaño —el teclado no podia avanzar mas de un
    // paso por refresco— y cada repeticion automatica invalidaba el panel entero.
    const next = {
      span: clamp(shownSpan + delta[0], 1, PANEL_COLUMNS),
      rowSpan: clamp(shownRowSpan + delta[1], 1, PANEL_MAX_ROWS),
    };
    if (next.span === shownSpan && next.rowSpan === shownRowSpan) return;

    commit(next);
  };

  return (
    <div
      ref={(node) => {
        cellRef.current = node;
        setNodeRef(node);
      }}
      style={style}
      data-riuna-sortable=""
      className={cn(
        "riuna-panel-cell group/widget relative",
        isDragging && "z-10 opacity-90 shadow-e2",
      )}
      // Sin `{...attributes}`: ponia `role="button" tabIndex={0}` en el
      // envoltorio, que mete el menu del widget —y ahora el tirador— dentro de
      // un boton ARIA. No hay `KeyboardSensor`, asi que no aportaba nada.
      {...listeners}
    >
      {children}
      {canResize && (
        // El tirador vive dentro de la tarjeta pero fuera del arrastre: los
        // `listeners` de dnd-kit son props sinteticas de React, asi que cortar
        // `onMouseDown`/`onTouchStart` aqui desactiva su activador de forma
        // determinista, sin depender del orden de los eventos de puntero.
        //
        // Solo a partir de `lg`: por debajo el ancho efectivo lo derivan las
        // media queries y la aritmetica de celdas no cuadraria. Los controles
        // del editor son la alternativa, y la unica via con teclado en movil.
        <button
          type="button"
          aria-label={t("panels:widget.resize")}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onKeyDown={nudge}
          onPointerDown={startResize}
          className="absolute right-0.5 bottom-0.5 hidden size-4 cursor-se-resize touch-none rounded-xs opacity-0 transition-opacity duration-(--motion-fast) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover/widget:opacity-100 lg:block"
        >
          <span
            aria-hidden
            className="absolute right-1 bottom-1 size-2 border-muted-foreground border-r-2 border-b-2"
          />
        </button>
      )}
    </div>
  );
}

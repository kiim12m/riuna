import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduleDay, ScheduleSegment } from "@/fetchers/schedule";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { CreateTaskPlaceholder } from "./create-task-placeholder";
import { DragGhost } from "./drag-ghost";
import {
  formatClock,
  hourMarks,
  minuteAtOffset,
  minutesToPx,
} from "./schedule-timeline";
import { type ResizeInfo, ScheduleSegmentCard } from "./segment-card";

const DAY_START_MINUTE = 0;
const DAY_END_MINUTE = 24 * 60;

/** Lo que hace falta para pintar la sombra en la columna de destino
 * (`drag-ghost.tsx`) mientras un tramo se arrastra hacia otro dia. */
type CrossDrag = {
  taskId: string;
  title: string;
  dayKey: string;
  startMinute: number;
  durationMinutes: number;
};

/** La fila real de un bloque (no el tramo fusionado y recortado que arma
 * `layoutDay`): lo que `create-block-dialog.tsx` necesita para abrirse en
 * modo edicion ya relleno. */
export type EditableBlock = NonNullable<
  Extract<ScheduleSegment, { type: "block" }>["entries"][number]["block"]
>;

/** Lo que el tramo sabe (`ResizeInfo`) mas lo que solo la rejilla tiene a
 * mano -tarea, proyecto, estimacion actual- para que la mutacion no tenga que
 * volver a buscarlo. */
export type ScheduleResizeEvent = ResizeInfo & {
  taskId: string;
  projectId: string;
  /** `task.estimate` tal cual (puede ser `null`): a que volver si el segundo
   * paso de la mutacion (anclar la hora, solo en el borde superior) falla
   * despues de que el primero (la estimacion) ya se escribiera. */
  previousEstimate: number | null;
  /** Base sobre la que sumar `deltaSeconds`: `previousEstimate` si lo hay, si
   * no `unestimatedEntrySeconds` -es la duracion que el usuario ya esta
   * viendo y arrastrando, igual que antes, pero ahora viene de la API
   * (`GET /schedule`), no de una constante local duplicada. */
  baseEstimateSeconds: number;
  /** Idem con el minimo: de la API (`minEntrySeconds`). */
  minEstimateSeconds: number;
};

/** Los limites de arrastre para redimensionar (no para mover) un tramo: el
 * final del bloque fijo anterior mas cercano ese dia, y el inicio del
 * siguiente -nunca el otro extremo del propio tramo, que ya limita
 * `resizeSegment` con `startMinute`/`durationMinutes`-. Solo mira segmentos
 * `block`: un tramo puede seguir solapando a otra tarea (queda en conflicto,
 * como ya pasaba), el limite real es unicamente contra algo que de verdad
 * ocupa esa hora. */
export function nearestBlockBounds(
  segments: ScheduleSegment[],
  index: number,
): { min: number; max: number } {
  let min = DAY_START_MINUTE;
  for (let i = index - 1; i >= 0; i--) {
    const sibling = segments[i];
    if (sibling.type === "block") {
      min = sibling.endSecond / 60;
      break;
    }
  }
  let max = DAY_END_MINUTE;
  for (let i = index + 1; i < segments.length; i++) {
    const sibling = segments[i];
    if (sibling.type === "block") {
      max = sibling.startSecond / 60;
      break;
    }
  }
  return { min, max };
}

/**
 * La rejilla por horas del Cronograma (ADR 041, actualizacion 2026-09-23):
 * 24 h fijas y siempre visibles -no solo la jornada laboral, como antes- para
 * que el hueco discontinuo de crear tarea (`CreateTaskPlaceholder`, portado
 * de super-productivity) tenga donde caer aunque el dia este vacio. Sirve
 * tanto a la vista Dia (una columna) como Semana (varias): quien decide
 * cuantos dias hay es `schedule-range.ts`, no este componente.
 */
export function TimeGrid({
  workspaceId,
  days,
  isWide,
  workStartMinute,
  workEndMinute,
  minEntrySeconds,
  unestimatedEntrySeconds,
  onOpen,
  onMove,
  onMoveDay,
  onUnpin,
  onResize,
  onAddBlock,
  onEditBlock,
}: {
  workspaceId: string;
  days: ScheduleDay[];
  /** Vista Dia: una sola columna a todo el ancho. Vista Semana: columnas fijas. */
  isWide: boolean;
  workStartMinute: number;
  workEndMinute: number;
  /** De `GET /schedule` (ver `apps/api/src/schedule/constants.ts`), no de una
   * copia local: `resizeSegment` los necesita para clamped la duracion. */
  minEntrySeconds: number;
  unestimatedEntrySeconds: number;
  onOpen: (segment: ScheduleSegment) => void;
  onMove: (taskId: string, minute: number) => void;
  onMoveDay: (
    taskId: string,
    projectId: string,
    dayKey: string,
    minute: number,
    durationMinutes: number,
  ) => void;
  onUnpin: (taskId: string) => void;
  onResize: (event: ScheduleResizeEvent) => void;
  onAddBlock: (dayDate: string) => void;
  onEditBlock: (block: EditableBlock) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridHeightPx = minutesToPx(DAY_END_MINUTE - DAY_START_MINUTE);

  // Vive aqui, no en cada columna, para que la de destino tambien la vea:
  // arrastrar un tramo silencia el hueco de crear tarea en TODAS las
  // columnas mientras dura -no solo en la de origen-, y ademas es lo que
  // dispara la sombra de destino (`crossDrag`, mas abajo).
  const [isSegmentInteracting, setIsSegmentInteracting] = useState(false);
  const [crossDrag, setCrossDrag] = useState<CrossDrag | null>(null);

  // Clave del rango visible, no `days` en si: mover o redimensionar una
  // tarea trae un `days` con una identidad nueva (la consulta se refresca),
  // y saltar a "ahora" en mitad de un arrastre se lleva por delante lo que
  // se estaba mirando. Solo hace falta reencuadrar al entrar o al cambiar de
  // dia/semana/mes -cuando el propio conjunto de dias cambia-, no cada vez
  // que sus datos se actualizan.
  const rangeKey = days.map((day) => day.dayDate).join(",");

  // Al entrar o cambiar de rango, deja visible la jornada laboral -o, si hoy
  // esta en pantalla, la hora actual- en vez de arrancar siempre a
  // medianoche. Depende de `rangeKey` (que dias hay), no de `days` en si
  // -que cambia de identidad con cada refresco tras mutar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver el comentario de arriba
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const hasToday = days.some((day) => day.isToday);
    const now = new Date();
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    const target = Math.max(
      0,
      minutesToPx((hasToday ? nowMinute : workStartMinute) - 60),
    );
    container.scrollTop = target;
  }, [rangeKey, workStartMinute]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-4">
      <div className="flex" style={{ minHeight: gridHeightPx + 40 }}>
        <div className="sticky top-0 left-0 z-20 w-12 shrink-0 bg-background">
          <div className="h-10" />
          <div className="relative" style={{ height: gridHeightPx }}>
            {hourMarks(DAY_START_MINUTE, DAY_END_MINUTE).map((mark) => (
              <div
                key={mark}
                className="absolute right-1 -translate-y-1/2 text-meta text-muted-foreground"
                style={{ top: minutesToPx(mark - DAY_START_MINUTE) }}
              >
                {formatClock(mark)}
              </div>
            ))}
          </div>
        </div>
        {days.map((day) => (
          <TimeGridColumn
            key={day.dayDate}
            workspaceId={workspaceId}
            day={day}
            isWide={isWide}
            workStartMinute={workStartMinute}
            workEndMinute={workEndMinute}
            minEntrySeconds={minEntrySeconds}
            unestimatedEntrySeconds={unestimatedEntrySeconds}
            onOpen={onOpen}
            onMove={onMove}
            onMoveDay={onMoveDay}
            onUnpin={onUnpin}
            onResize={onResize}
            onAddBlock={() => onAddBlock(day.dayDate)}
            onEditBlock={onEditBlock}
            isSegmentInteracting={isSegmentInteracting}
            onSegmentInteractionChange={setIsSegmentInteracting}
            crossDragGhost={
              crossDrag?.dayKey === day.dayDate ? crossDrag : null
            }
            onCrossDayDrag={setCrossDrag}
          />
        ))}
      </div>
    </div>
  );
}

function TimeGridColumn({
  workspaceId,
  day,
  isWide,
  workStartMinute,
  workEndMinute,
  minEntrySeconds,
  unestimatedEntrySeconds,
  onOpen,
  onMove,
  onMoveDay,
  onUnpin,
  onResize,
  onAddBlock,
  onEditBlock,
  isSegmentInteracting,
  onSegmentInteractionChange,
  crossDragGhost,
  onCrossDayDrag,
}: {
  workspaceId: string;
  day: ScheduleDay;
  isWide: boolean;
  workStartMinute: number;
  workEndMinute: number;
  minEntrySeconds: number;
  unestimatedEntrySeconds: number;
  onOpen: (segment: ScheduleSegment) => void;
  onMove: (taskId: string, minute: number) => void;
  onMoveDay: (
    taskId: string,
    projectId: string,
    dayKey: string,
    minute: number,
    durationMinutes: number,
  ) => void;
  onUnpin: (taskId: string) => void;
  onResize: (event: ScheduleResizeEvent) => void;
  onAddBlock: () => void;
  onEditBlock: (block: EditableBlock) => void;
  /** Se mueve o redimensiona un tramo en CUALQUIER columna (vive en
   * `TimeGrid`, no aqui): la de destino tambien debe callar su hueco de
   * crear tarea mientras dura, no solo la de origen. */
  isSegmentInteracting: boolean;
  onSegmentInteractionChange: (interacting: boolean) => void;
  /** La sombra a pintar aqui porque un tramo de otra columna se esta
   * arrastrando hacia esta, o `null` si no es esta la columna de destino. */
  crossDragGhost: CrossDrag | null;
  onCrossDayDrag: (target: CrossDrag | null) => void;
}) {
  const { t } = useTranslation();
  const date = new Date(`${day.dayDate}T00:00:00`);
  const gridHeightPx = minutesToPx(DAY_END_MINUTE - DAY_START_MINUTE);
  const nowMinute = new Date().getHours() * 60 + new Date().getMinutes();

  const [hoverMinute, setHoverMinute] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isSegmentInteracting) setHoverMinute(null);
  }, [isSegmentInteracting]);

  const loadSeconds = day.segments
    .filter((segment) => segment.type === "flow" || segment.type === "pinned")
    .reduce(
      (total, segment) => total + (segment.endSecond - segment.startSecond),
      0,
    );
  const loadPct = Math.round(
    (loadSeconds / ((workEndMinute - workStartMinute) * 60)) * 100,
  );

  const stopCreating = () => {
    setIsCreating(false);
    setHoverMinute(null);
  };

  return (
    <div
      data-testid={`schedule-column-${day.dayDate}`}
      className={cn(
        "shrink-0 border-border/60 border-l",
        isWide ? "flex-1" : "w-48",
      )}
    >
      <div className="sticky top-0 z-10 h-10 space-y-1 bg-background px-2 py-1">
        <div className="flex items-center justify-between">
          <h2 className="truncate text-section">
            {day.isToday
              ? `${t("schedule:today")} · ${formatDate(date, { weekday: "short", day: "numeric" })}`
              : formatDate(date, { weekday: "short", day: "numeric" })}
          </h2>
          <button
            type="button"
            onClick={onAddBlock}
            aria-label={t("schedule:createBlock.title")}
            className="rounded px-1 text-meta text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            +
          </button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              loadPct > 100 ? "bg-warning-foreground" : "bg-brand",
            )}
            style={{ width: `${Math.min(loadPct, 100)}%` }}
          />
        </div>
      </div>

      <div
        className="relative"
        data-day-key={day.dayDate}
        style={{ height: gridHeightPx }}
      >
        {/* `data-day-key` en este contenedor, no en el de arriba (con la
         * cabecera): `segment-card.tsx` lo usa via `elementFromPoint` para
         * saber a que dia se ha arrastrado un tramo, y necesita el mismo
         * origen vertical (minuto 0) que usa para calcular la hora. */}
        {/* Fondo: la unica capa que escucha el puntero para el hueco de
         * crear tarea. Las decorativas de encima llevan `pointer-events-none`
         * para no taparlo; los segmentos, en cambio, si lo tapan -es lo que
         * impide ofrecer crear una tarea encima de una que ya existe.
         * `role="button"` + `onKeyDown`: Enter/Espacio abren el editor en la
         * jornada laboral para quien navega por teclado, sin exigir el
         * hover -por naturaleza solo de raton- para llegar hasta ahi. */}
        {/** biome-ignore lint/a11y/useSemanticElements: necesita seguir siendo
         * un fondo posicionado a toda la columna para leer coordenadas de
         * puntero -mismo patron que `segment-card.tsx`. */}
        <div
          data-testid={`schedule-slot-trigger-${day.dayDate}`}
          role="button"
          tabIndex={0}
          aria-label={`${t("schedule:placeholder.clickToCreate")} — ${formatDate(date, { weekday: "long", day: "numeric" })}`}
          className="absolute inset-0"
          onPointerMove={(event) => {
            if (isCreating || isSegmentInteracting) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setHoverMinute(
              minuteAtOffset(event.clientY - rect.top, DAY_START_MINUTE),
            );
          }}
          onPointerLeave={() => {
            if (!isCreating) setHoverMinute(null);
          }}
          onClick={() => setIsCreating(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setHoverMinute((current) => current ?? workStartMinute);
              setIsCreating(true);
            }
          }}
        />

        <div
          className="pointer-events-none absolute inset-x-0 bg-muted/30"
          style={{
            top: minutesToPx(workStartMinute - DAY_START_MINUTE),
            height: minutesToPx(workEndMinute - workStartMinute),
          }}
        />
        {hourMarks(DAY_START_MINUTE, DAY_END_MINUTE).map((mark) => (
          <div
            key={mark}
            className="pointer-events-none absolute inset-x-0 border-border/40 border-t"
            style={{ top: minutesToPx(mark - DAY_START_MINUTE) }}
          />
        ))}
        {day.isToday && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive"
            style={{ top: minutesToPx(nowMinute - DAY_START_MINUTE) }}
          />
        )}

        {day.segments.map((segment, index) => {
          if (segment.type === "block") {
            const primary = segment.entries[0];
            return (
              <div
                key={`${segment.startSecond}-${segment.endSecond}`}
                className={cn(
                  "absolute inset-x-1 overflow-hidden rounded-md border border-dashed p-1 text-meta",
                  primary?.kind === "running"
                    ? "border-destructive/50 bg-destructive/10"
                    : primary?.kind === "break"
                      ? "border-border/70 bg-muted/60"
                      : "border-border/70 bg-muted/40",
                )}
                style={{
                  top: minutesToPx(segment.startSecond / 60 - DAY_START_MINUTE),
                  height: Math.max(
                    minutesToPx((segment.endSecond - segment.startSecond) / 60),
                    16,
                  ),
                }}
              >
                {/* Cada entrada por su cuenta, no un `.join(" / ")` en un
                 * solo `<span>`: dos bloques que se solapan (uno puesto
                 * encima de otro) se funden en el mismo tramo visual
                 * (`layout.ts`, `mergeBlockers`), y con un solo texto
                 * conjunto no habia forma de editar ninguno de los dos -se
                 * quedaban "atascados", sin poder tocarlos-. Un `<button>`
                 * real por entrada evita ademas el hack de `role="button"`
                 * + `onKeyDown` a mano. */}
                <div className="flex h-full flex-col gap-0.5 overflow-hidden">
                  {segment.entries.map((entry) =>
                    entry.block ? (
                      <button
                        key={entry.id}
                        type="button"
                        title={t("schedule:createBlock.editHint")}
                        onClick={() =>
                          onEditBlock(entry.block as EditableBlock)
                        }
                        className="truncate text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {entry.title}
                      </button>
                    ) : (
                      <span key={entry.id} className="truncate">
                        {entry.title ||
                          (entry.kind === "running"
                            ? t("schedule:running")
                            : // Un tramo `break` sin bloque real detras es
                              // la comida sintetica de la jornada (ADR 045):
                              // nunca tiene fila que editar.
                              t("schedule:lunch"))}
                      </span>
                    ),
                  )}
                </div>
              </div>
            );
          }

          if (!segment.task) return null;
          // Extraida aparte: el estrechamiento de `segment.task` a no-nulo
          // no cruza el limite de la funcion flecha que arma `onResize` mas
          // abajo, y con `segment.task` a secas TypeScript lo vuelve a ver
          // opcional ahi dentro.
          const task = segment.task;
          const resizeBounds = nearestBlockBounds(day.segments, index);

          return (
            <ScheduleSegmentCard
              key={`${segment.taskId}-${segment.startSecond}`}
              task={task}
              dayKey={day.dayDate}
              startMinute={segment.startSecond / 60}
              durationMinutes={(segment.endSecond - segment.startSecond) / 60}
              isPinned={segment.type === "pinned"}
              conflict={segment.type === "pinned" && segment.conflict}
              truncated={segment.type === "flow" && segment.truncated}
              canResizeTop={
                segment.type === "pinned" ||
                (segment.type === "flow" && segment.part === 0)
              }
              // La ultima parte de una tarea que fluye (o la unica, si no se
              // partio): partir mas seguido no dejaria hueco donde alargarla
              // por debajo, igual que `canResizeTop` con la primera.
              canResizeBottom={
                segment.type === "pinned" ||
                (segment.type === "flow" &&
                  !day.segments.some(
                    (sibling) =>
                      sibling.type === "flow" &&
                      sibling.taskId === segment.taskId &&
                      sibling.part > segment.part,
                  ))
              }
              gridStart={DAY_START_MINUTE}
              minMinute={DAY_START_MINUTE}
              maxMinute={DAY_END_MINUTE}
              resizeMinMinute={resizeBounds.min}
              resizeMaxMinute={resizeBounds.max}
              minDurationMinutes={minEntrySeconds / 60}
              onOpen={() => onOpen(segment)}
              onMove={(minute) => onMove(segment.taskId, minute)}
              onMoveDay={(targetDayKey, minute) =>
                onMoveDay(
                  segment.taskId,
                  task.projectId,
                  targetDayKey,
                  minute,
                  (segment.endSecond - segment.startSecond) / 60,
                )
              }
              onUnpin={
                segment.type === "pinned"
                  ? () => onUnpin(segment.taskId)
                  : undefined
              }
              onResize={(info) =>
                onResize({
                  ...info,
                  taskId: segment.taskId,
                  projectId: task.projectId,
                  previousEstimate: task.estimate,
                  baseEstimateSeconds: task.estimate || unestimatedEntrySeconds,
                  minEstimateSeconds: minEntrySeconds,
                })
              }
              onInteractionChange={onSegmentInteractionChange}
              onCrossDayDrag={(target) =>
                onCrossDayDrag(
                  target && {
                    taskId: segment.taskId,
                    title: task.title,
                    dayKey: target.dayKey,
                    startMinute: target.startMinute,
                    durationMinutes:
                      (segment.endSecond - segment.startSecond) / 60,
                  },
                )
              }
            />
          );
        })}

        {crossDragGhost && (
          <DragGhost
            title={crossDragGhost.title}
            startMinute={crossDragGhost.startMinute}
            durationMinutes={crossDragGhost.durationMinutes}
            gridStart={DAY_START_MINUTE}
          />
        )}

        {hoverMinute !== null && (
          <CreateTaskPlaceholder
            workspaceId={workspaceId}
            plannedDate={day.dayDate}
            startMinute={hoverMinute}
            variant="time"
            isEditing={isCreating}
            onEditEnd={stopCreating}
            style={{
              top: minutesToPx(hoverMinute - DAY_START_MINUTE),
              height: minutesToPx(30),
            }}
          />
        )}
      </div>

      {day.overflow.length > 0 && (
        <div className="space-y-1 border-t px-2 py-1.5">
          <p className="text-meta text-muted-foreground">
            {t("schedule:overflow")}
          </p>
          {day.overflow.map((entry) =>
            entry.task ? (
              <button
                key={entry.taskId}
                type="button"
                onClick={() =>
                  onOpen({
                    type: "flow",
                    taskId: entry.taskId,
                    startSecond: 0,
                    endSecond: 0,
                    part: 0,
                    truncated: false,
                    task: entry.task,
                  })
                }
                className="block w-full truncate rounded px-1 py-0.5 text-left text-meta hover:bg-muted"
              >
                {entry.task.title}
              </button>
            ) : null,
          )}
        </div>
      )}

      {day.ghosts.length > 0 && (
        <div className="space-y-1 border-t px-2 py-1.5 opacity-70">
          {day.ghosts.map((ghost) => (
            <div
              key={`${ghost.recurrenceId}-${ghost.plannedDate}`}
              className="truncate rounded border border-dashed px-1 py-0.5 text-meta"
            >
              {ghost.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

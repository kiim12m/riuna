import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type RitualStep = {
  id: string;
  title: string;
  hint?: string;
  content: ReactNode;
  /** `false` bloquea «Siguiente»: el paso pide algo antes de seguir. */
  canContinue?: boolean;
  /** Por que no se puede seguir, junto al boton. */
  blockedReason?: string;
};

/**
 * El armazon de un ritual (ADR 054): pasos en orden, con su progreso, atras,
 * siguiente y salir. Lo comparten «Terminar el dia», «Planificar el dia» y la
 * revision semanal. Solo se entra con un boton -decidido: sin avisos ni
 * banners-, asi que salir no pregunta: no se ha guardado nada hasta el ultimo
 * paso.
 */
export function RitualShell({
  title,
  steps,
  finishLabel,
  onFinish,
  isFinishing = false,
  onExit,
}: {
  title: string;
  steps: RitualStep[];
  finishLabel: string;
  onFinish: () => void;
  isFinishing?: boolean;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;
  const blocked = step.canContinue === false;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4">
      <header className="space-y-2">
        <p className="text-meta text-muted-foreground">
          {t("rituals:stepOf", { current: index + 1, total: steps.length })}
        </p>
        <h1 className="text-page">{title}</h1>
        <ol className="flex gap-1" aria-label={title}>
          {steps.map((candidate, position) => (
            <li
              key={candidate.id}
              aria-current={position === index ? "step" : undefined}
              className={cn(
                "h-1 flex-1 rounded-full bg-muted",
                position <= index && "bg-brand",
              )}
            >
              <span className="sr-only">{candidate.title}</span>
            </li>
          ))}
        </ol>
      </header>

      <section
        aria-labelledby={headingId}
        className="space-y-3"
        data-testid={`ritual-step-${step.id}`}
      >
        <div>
          <h2 id={headingId} className="text-section">
            {step.title}
          </h2>
          {step.hint && (
            <p className="text-meta text-muted-foreground">{step.hint}</p>
          )}
        </div>
        {step.content}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-border/80 border-t pt-4">
        <Button variant="ghost" onClick={onExit}>
          {t("rituals:exit")}
        </Button>
        <div className="flex items-center gap-2">
          {blocked && step.blockedReason && (
            <span className="text-meta text-muted-foreground">
              {step.blockedReason}
            </span>
          )}
          {index > 0 && (
            <Button
              variant="outline"
              onClick={() => setIndex((current) => current - 1)}
            >
              {t("rituals:back")}
            </Button>
          )}
          {isLast ? (
            <Button disabled={blocked || isFinishing} onClick={onFinish}>
              {finishLabel}
            </Button>
          ) : (
            <Button
              disabled={blocked}
              onClick={() => setIndex((current) => current + 1)}
            >
              {t("rituals:next")}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

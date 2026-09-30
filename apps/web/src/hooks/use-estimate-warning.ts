import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";

/**
 * Avisa una sola vez por entrada cuando lo registrado supera la estimacion,
 * no en cada segundo que el cronometro sigue corriendo por encima. El
 * `Set` de ids ya avisados vive en un ref porque no debe disparar un
 * render de mas.
 */
export function useEstimateWarning(
  entryId: string | undefined,
  overEstimate: boolean,
  message: string,
) {
  const warnedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!entryId || !overEstimate) return;
    if (warnedRef.current.has(entryId)) return;

    warnedRef.current.add(entryId);
    toast.warning(message);
  }, [entryId, overEstimate, message]);
}

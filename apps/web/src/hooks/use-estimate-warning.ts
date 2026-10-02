import { useEffect } from "react";
import { toast } from "@/lib/toast";

const STORAGE_KEY = "riuna:estimate-warned";
/** Basta con las ultimas entradas: una ya parada no vuelve a avisar. */
const MAX_REMEMBERED = 50;

// En memoria del modulo, no en un ref: el aviso es una vez por entrada y
// pestana, no una vez por montaje del componente que lo pide.
let warned: string[] | null = null;

function loadWarned(): string[] {
  if (warned) return warned;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    warned = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    warned = [];
  }
  return warned;
}

function rememberWarned(entryId: string) {
  const next = [...loadWarned(), entryId].slice(-MAX_REMEMBERED);
  warned = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin sessionStorage (ventana privada estricta) basta con la memoria.
  }
}

/**
 * Avisa una sola vez por entrada cuando lo registrado supera la estimacion,
 * no en cada segundo que el cronometro sigue corriendo por encima. Lo ya
 * avisado sobrevive a recargar la pestana (`sessionStorage`): antes vivia en
 * un ref de la barra lateral, que se montaba de nuevo en cada ruta y volvia a
 * avisar en cada cambio de pantalla (ADR 048).
 */
export function useEstimateWarning(
  entryId: string | undefined,
  overEstimate: boolean,
  message: string,
) {
  useEffect(() => {
    if (!entryId || !overEstimate) return;
    if (loadWarned().includes(entryId)) return;

    rememberWarned(entryId);
    toast.warning(message);
  }, [entryId, overEstimate, message]);
}

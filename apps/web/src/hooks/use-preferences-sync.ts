import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/fetchers/user-preferences";
import {
  applicableFromServer,
  changedKeys,
  differingFromDefaults,
  pickSynced,
  type SyncedKey,
} from "@/lib/preferences-sync";
import { useUserPreferencesStore } from "@/store/user-preferences";

/** Lo que se espera tras el ultimo cambio antes de mandarlo: varios seguidos van juntos. */
const FLUSH_DELAY_MS = 600;

/**
 * Lleva las preferencias de presentacion del almacen local a la cuenta y las
 * trae de vuelta (ADR 064). El almacen sigue siendo la memoria inmediata —la
 * interfaz no espera al servidor—; esto solo las sincroniza.
 *
 * - Al abrir, si el servidor tiene preferencias se aplican, **salvo las claves
 *   que la persona ha cambiado mientras tanto**: su cambio mas reciente gana.
 * - Si el servidor no tiene nada, se sube lo que este navegador ya habia
 *   personalizado, para que cambiar de navegador no lo pierda.
 * - Cada cambio posterior se manda con una pequeña espera, y si falla se
 *   conserva para el siguiente intento.
 */
export function usePreferencesSync() {
  const { data: server, isSuccess } = useQuery({
    queryKey: ["user-preferences"],
    queryFn: getUserPreferences,
    // Se lee una vez por sesion: las escrituras de esta pestaña ya estan en el
    // almacen, y refrescar traeria su propio eco.
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  const loaded = useRef(false);
  const applyingRemote = useRef(false);
  const touched = useRef(new Set<SyncedKey>());
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushRef = useRef(async () => {});
  flushRef.current = async () => {
    if (!loaded.current || Object.keys(pending.current).length === 0) return;
    const batch = pending.current;
    pending.current = {};
    try {
      await updateUserPreferences(batch);
    } catch (error) {
      // No se pierde: vuelve a la cola y sale con el siguiente cambio.
      pending.current = { ...batch, ...pending.current };
      if (import.meta.env.DEV) console.warn("preferences sync failed", error);
    }
  };

  const schedule = useRef(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), FLUSH_DELAY_MS);
  });

  // Lo que la persona cambia, desde el primer momento.
  useEffect(() => {
    const unsubscribe = useUserPreferencesStore.subscribe((state, previous) => {
      if (applyingRemote.current) return;
      const changed = changedKeys(previous, state);
      if (changed.length === 0) return;
      for (const key of changed) {
        touched.current.add(key);
        pending.current[key] = state[key];
      }
      schedule.current();
    });

    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Lo que trae el servidor, una vez.
  useEffect(() => {
    if (!isSuccess || loaded.current || !server) return;

    if (Object.keys(server).length > 0) {
      applyingRemote.current = true;
      try {
        useUserPreferencesStore.setState(
          applicableFromServer(server, touched.current),
        );
      } finally {
        applyingRemote.current = false;
      }
    } else {
      Object.assign(
        pending.current,
        differingFromDefaults(pickSynced(useUserPreferencesStore.getState())),
      );
    }

    loaded.current = true;
    schedule.current();
  }, [isSuccess, server]);
}

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Lo que la API sabe de las copias (ADR 075): el directorio que escriben el
 * servicio `backup` y el `offsite` de `compose.local.yml`, montado de solo
 * lectura en `BACKUP_DIR`. Sin `BACKUP_DIR`, «no configurado»: la API no
 * alerta de unas copias de las que no sabe nada.
 *
 * Con `BACKUP_DIR` pero sin poder leerlo (el montaje se perdió), «ilegible»,
 * que es un problema en sí. Antes contaba como «no configurado», y cerraba
 * como resueltas las alertas de copias abiertas (revisión de la Fase 9).
 */

export type OffsiteState = {
  status: string;
  checkedAt: string | null;
  lastSuccessAt: string | null;
  latest: string | null;
  remoteCount: number | null;
  message: string | null;
};

export type BackupState = {
  configured: boolean;
  readable: boolean;
  latest: { file: string; createdAt: string; sizeBytes: number } | null;
  count: number;
  offsite: OffsiteState | null;
};

const BACKUP_FILE = /^riuna_\d{4}-\d{2}-\d{2}_\d{6}\.sql\.gz$/;

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function readOffsite(dir: string): Promise<OffsiteState | null> {
  try {
    const raw = JSON.parse(
      await readFile(join(dir, ".offsite-status.json"), "utf8"),
    ) as Record<string, unknown>;
    return {
      status: text(raw.status) ?? "unknown",
      checkedAt: text(raw.checkedAt),
      lastSuccessAt: text(raw.lastSuccessAt),
      latest: text(raw.latest),
      remoteCount: typeof raw.remoteCount === "number" ? raw.remoteCount : null,
      message: text(raw.message),
    };
  } catch {
    // Sin fichero: la copia externa no está montada (perfil `offsite`).
    return null;
  }
}

export async function readBackupState(
  dir = process.env.BACKUP_DIR?.trim(),
): Promise<BackupState> {
  const empty = { latest: null, count: 0, offsite: null };
  if (!dir) return { configured: false, readable: false, ...empty };

  let files: string[];
  let latest: BackupState["latest"] = null;
  try {
    files = (await readdir(dir)).filter((name) => BACKUP_FILE.test(name));
    // Los nombres llevan la fecha: ordenarlos es ordenarlos por antigüedad.
    files.sort();
    const newest = files.at(-1);
    if (newest) {
      const info = await stat(join(dir, newest));
      latest = {
        file: newest,
        createdAt: info.mtime.toISOString(),
        sizeBytes: info.size,
      };
    }
  } catch {
    return { configured: true, readable: false, ...empty };
  }

  return {
    configured: true,
    readable: true,
    latest,
    count: files.length,
    offsite: await readOffsite(dir),
  };
}

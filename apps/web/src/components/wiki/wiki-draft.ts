// El borrador de una pagina mientras se edita (ADR 092), en este navegador:
// si se cierra la pestaña o se cae la red, lo escrito no se pierde. El
// almacenamiento puede no existir —navegacion privada, cuota llena—, asi que
// todo va envuelto y un fallo solo significa que no hay borrador.

export type WikiDraft = {
  baseVersion: number;
  title: string;
  content: string;
  savedAt: string;
};

const key = (pageId: string) => `riuna:wiki-draft:${pageId}`;

export function readWikiDraft(pageId: string): WikiDraft | null {
  try {
    const raw = window.localStorage.getItem(key(pageId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<WikiDraft>;
    if (
      typeof draft.baseVersion !== "number" ||
      typeof draft.title !== "string" ||
      typeof draft.content !== "string"
    ) {
      return null;
    }
    return {
      baseVersion: draft.baseVersion,
      title: draft.title,
      content: draft.content,
      savedAt: typeof draft.savedAt === "string" ? draft.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeWikiDraft(
  pageId: string,
  draft: Omit<WikiDraft, "savedAt">,
) {
  try {
    window.localStorage.setItem(
      key(pageId),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearWikiDraft(pageId: string) {
  try {
    window.localStorage.removeItem(key(pageId));
  } catch {
    // Sin almacenamiento no habia borrador que quitar.
  }
}

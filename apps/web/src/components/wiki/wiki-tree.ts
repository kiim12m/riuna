// El arbol de la wiki a partir de la lista plana de la API (ADR 092).

export type TreeSource = {
  id: string;
  title: string;
  parentId: string | null;
  projectId: string | null;
  position: number;
};

export type TreeNode<T extends TreeSource> = T & {
  depth: number;
  children: Array<TreeNode<T>>;
};

/**
 * Agrupa por padre, en el orden de la API. Una pagina cuyo padre no esta en la
 * lista —de otro alcance, o borrado entre medias— sale en la raiz en vez de
 * desaparecer.
 */
export function buildWikiTree<T extends TreeSource>(pages: T[]) {
  const ids = new Set(pages.map((page) => page.id));
  const byParent = new Map<string | null, T[]>();
  for (const page of pages) {
    const parent =
      page.parentId && ids.has(page.parentId) ? page.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), page]);
  }

  const build = (parent: string | null, depth: number): Array<TreeNode<T>> =>
    (byParent.get(parent) ?? []).map((page) => ({
      ...page,
      depth,
      children: build(page.id, depth + 1),
    }));

  return build(null, 0);
}

/** Los ids de toda la rama de una pagina, ella fuera. */
export function descendantIds<T extends TreeSource>(pages: T[], id: string) {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const page of pages) {
      if (page.parentId === current && !out.has(page.id)) {
        out.add(page.id);
        stack.push(page.id);
      }
    }
  }
  return out;
}

/** El camino de la raiz a una pagina, para la miga de pan. */
export function pathTo<T extends TreeSource>(pages: T[], id: string) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const path: T[] = [];
  let current = byId.get(id);
  while (current && path.length < 50) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

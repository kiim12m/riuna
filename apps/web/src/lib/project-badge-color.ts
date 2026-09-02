// Asigna a cada proyecto uno de los ocho colores de identidad de forma
// determinista por su id (ver --pj-1..8 en index.css). Mismo proyecto, mismo
// color siempre; distintos proyectos, colores repartidos.
const PALETTE_SIZE = 8;

export function getProjectBadgeColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = (Math.abs(hash) % PALETTE_SIZE) + 1;
  return `var(--pj-${index})`;
}

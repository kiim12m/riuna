// Rasteriza el símbolo de Riuna a PNG/ICO sin dependencias.
//
// No rasteriza el SVG: no hay rasterizador en el entorno de desarrollo. El
// símbolo son dos arcos circulares con cabos redondos y dos nodos concéntricos,
// así que se resuelve analíticamente con una SDF y se codifica el PNG a mano.
//
//   node scripts/brand/render-icons.mjs apps/web/public
//
// La geometría de abajo es la fuente de verdad de los mapas de bits. Si cambia,
// hay que cambiarla también en apps/web/public/favicon.svg y en
// apps/web/src/components/common/logo.tsx — ver docs/marca.md §03.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const OUT = process.argv[2];
if (!OUT)
  throw new Error(
    "uso: node scripts/brand/render-icons.mjs <directorio-destino>",
  );

// --- geometría, en la retícula de 32 unidades del manual de marca ---
const CX = 16;
const CY = 16;
const R_RING = 10;
// Ángulos de pantalla: 0 = derecha, 90 = abajo. El corte va en diagonal.
const A_ENTRADA = 135;
const A_SALIDA = 315;
const W_NAVY = 2.6;
const W_TEAL = 3.6;
const R_NODO = 3.7;
const R_NUCLEO = 2.1;
// Sin núcleos el nodo engorda un poco para no perder peso en miniatura.
const R_NODO_SIMPLE = 3.9;

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const rad = (d) => (d * Math.PI) / 180;
const en = (deg, r = R_RING) => [
  CX + r * Math.cos(rad(deg)),
  CY + r * Math.sin(rad(deg)),
];

/** Arco circular con cabos redondos, definido por centro, radio y rango angular. */
function arco(desde, hasta, color, w) {
  const a1 = norm(rad(desde));
  const span = norm(rad(hasta) - a1);
  const [x1, y1] = en(desde);
  const [x2, y2] = en(hasta);
  return {
    color,
    w,
    dist(px, py) {
      const th = norm(Math.atan2(py - CY, px - CX));
      if (norm(th - a1) <= span)
        return Math.abs(Math.hypot(px - CX, py - CY) - R_RING);
      // Fuera del rango angular medimos a los extremos: eso da el cabo redondo.
      return Math.min(
        Math.hypot(px - x1, py - y1),
        Math.hypot(px - x2, py - y2),
      );
    },
  };
}

const disco = (p, r, color) => ({
  color,
  w: 0,
  dist: (px, py) => Math.hypot(px - p[0], py - p[1]) - r,
});

const ENTRADA = en(A_ENTRADA);
const SALIDA = en(A_SALIDA);

/**
 * El orden importa: se pinta de abajo arriba, así que los núcleos van al final.
 * `simple` deja los nodos macizos — por debajo de ~32 px el núcleo no cabe.
 */
function simbolo(simple) {
  const formas = [
    arco(A_ENTRADA, A_SALIDA, "navy", W_NAVY),
    arco(A_SALIDA, A_ENTRADA + 360, "teal", W_TEAL),
  ];
  if (simple) {
    formas.push(
      disco(ENTRADA, R_NODO_SIMPLE, "navy"),
      disco(SALIDA, R_NODO_SIMPLE, "teal"),
    );
  } else {
    // Cada nodo es el negativo del otro.
    formas.push(
      disco(ENTRADA, R_NODO, "navy"),
      disco(SALIDA, R_NODO, "teal"),
      disco(ENTRADA, R_NUCLEO, "teal"),
      disco(SALIDA, R_NUCLEO, "navy"),
    );
  }
  return formas;
}

const hex = (h) => [
  Number.parseInt(h.slice(1, 3), 16),
  Number.parseInt(h.slice(3, 5), 16),
  Number.parseInt(h.slice(5, 7), 16),
];

/**
 * @param size   lado en píxeles
 * @param scale  fracción del lado que ocupa el símbolo (zona segura)
 * @param simple nodos macizos, sin núcleo
 */
function render(size, { scale, simple, bg, navy, teal }) {
  const SS = 4; // supermuestreo 4×4
  const px = new Uint8Array(size * size * 4);
  const fondo = hex(bg);
  const cols = { navy: hex(navy), teal: hex(teal) };
  const formas = simbolo(simple);

  const span = size * scale;
  const off = (size - span) / 2;
  const toU = (p) => ((p - off) / span) * 32;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Cobertura por supermuestreo; la forma de más arriba gana cada submuestra.
      const cov = formas.map(() => 0);
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = toU(x + (sx + 0.5) / SS);
          const uy = toU(y + (sy + 0.5) / SS);
          for (let i = formas.length - 1; i >= 0; i--) {
            if (formas[i].dist(ux, uy) <= formas[i].w / 2) {
              cov[i] += 1 / (SS * SS);
              break;
            }
          }
        }
      }

      let [r, g, b] = fondo;
      for (let i = 0; i < formas.length; i++) {
        const c = cov[i];
        if (!c) continue;
        const col = cols[formas[i].color];
        r = r * (1 - c) + col[0] * c;
        g = g * (1 - c) + col[1] * c;
        b = b * (1 - c) + col[2] * c;
      }

      const o = (y * size + x) * 4;
      px[o] = Math.round(r);
      px[o + 1] = Math.round(g);
      px[o + 2] = Math.round(b);
      px[o + 3] = 255;
    }
  }
  return px;
}

// --- codificador PNG mínimo ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro None
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function toIco(entries) {
  const dir = Buffer.alloc(6 + entries.length * 16);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);
  let offset = dir.length;
  entries.forEach((e, i) => {
    const p = 6 + i * 16;
    dir[p] = e.size >= 256 ? 0 : e.size;
    dir[p + 1] = e.size >= 256 ? 0 : e.size;
    dir.writeUInt16LE(1, p + 4);
    dir.writeUInt16LE(32, p + 6);
    dir.writeUInt32LE(e.png.length, p + 8);
    dir.writeUInt32LE(offset, p + 12);
    offset += e.png.length;
  });
  return Buffer.concat([dir, ...entries.map((e) => e.png)]);
}

// --- paleta del icono (docs/marca.md §04) ---
// Sobre navy, lo que en tema claro es navy se pinta en blanco.
const SKIN = { bg: "#1B3A5C", navy: "#FFFFFF", teal: "#2AB39F" };

const write = (name, size, opts) => {
  const png = toPng(size, render(size, { ...SKIN, ...opts }));
  writeFileSync(join(OUT, name), png);
  const nodos = opts.simple ? "nodos macizos" : "nodos con núcleo";
  console.log(
    `${name.padEnd(30)} ${size}×${size}  ${nodos}  ${(png.length / 1024).toFixed(1)} kB`,
  );
};

// Maskable: el contenido debe caber en el 80% central, de ahí el 0.6.
write("web-app-manifest-192x192.png", 192, { scale: 0.6, simple: false });
write("web-app-manifest-512x512.png", 512, { scale: 0.6, simple: false });
// iOS aplica su propia máscara redondeada.
write("apple-touch-icon.png", 180, { scale: 0.68, simple: false });
write("favicon-96x96.png", 96, { scale: 0.74, simple: false });

// El núcleo deja de caber por debajo de ~32 px de símbolo: 48 lo conserva, el resto no.
const ico = toIco(
  [48, 32, 16].map((size) => ({
    size,
    png: toPng(size, render(size, { ...SKIN, scale: 0.78, simple: size < 48 })),
  })),
);
writeFileSync(join(OUT, "favicon.ico"), ico);
console.log(
  `${"favicon.ico".padEnd(30)} 48/32/16  ${(ico.length / 1024).toFixed(1)} kB`,
);

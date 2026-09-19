# ADR 018 — La escala tipográfica pasa a tokens

**Fecha:** 2026-09-02 · **Estado:** aceptada

**Contexto.** [`marca.md`](../marca.md) §05 fija siete roles de texto (Display 30,
Título de página 20, Título de sección 16, Cuerpo 14, Secundario 12, Etiqueta 11
versalita, Monoespaciada 13) con su peso e interletrado. En `apps/web` esa escala
solo existe aplicada a mano con utilidades: `text-sm` y `text-xs` suman 796 de 890
usos de tamaño. «Cuerpo son 14 px» es una costumbre, no una decisión que el código
pueda comprobar.

**Decisión.** Añadir a `apps/web/src/index.css` los tokens `--text-display`,
`--text-page`, `--text-section`, `--text-body`, `--text-secondary`, `--text-label`
y `--text-mono`, cada uno con su interlínea (`--lh-*`) e interletrado (`--tr-*`),
con los valores de §05. Los componentes pasan a consumirlos. No se añade una
segunda familia: Geist hace display, cuerpo y monoespaciada.

**Consecuencias.**
- `marca.md` §05 sigue mandando sobre los valores concretos; este ADR solo los
  materializa.
- La escala es densa a propósito (14/12). Los tokens no la cambian, la fijan.
- Migración incremental: los tokens conviven con las utilidades hasta que cada
  superficie se pasa. No hay un corte único.
- Referencia visual: [`design-previews/sistema-base.html`](../design-previews/sistema-base.html),
  sección «Tipografía».

---

**Corrección de la Fase 7 (2026-09-08).** El token `--text-secondary` **no
funciona con el nombre que le puso esta ADR**, y no funcionaba desde el día que
se escribió: en Tailwind v4 el prefijo `text-` lo comparten el tamaño y el color,
y `--secondary` ya existe como color de shadcn. La utilidad `text-secondary`
compilaba a `color: var(--secondary)` —un gris pálido— en vez de a 12 px.

No se había notado porque **nadie había consumido la escala todavía**: la ADR
previó una migración incremental y la primera superficie en pasarse fue el panel
de la Fase 7. Se vio en pantalla, con medio panel lavado, y se confirmó
compilando el CSS y leyendo la regla emitida.

El rol se renombra a **`--text-meta`** —«metadatos, fechas, contadores, ayudas»,
que es literalmente lo que `marca.md` §05 le asigna— y así deja de colisionar.
Los otros seis roles se comprobaron uno a uno y no chocan con ningún color.

**La lección, para la próxima superficie que se pase a la escala:** un token
`--text-*` cuyo nombre coincida con un color existente es inservible en silencio.
No da error: da otro estilo.

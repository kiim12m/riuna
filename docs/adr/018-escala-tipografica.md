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

---
name: Riuna
description: Plataforma de productividad autoalojada, densa a propósito, con tema claro y oscuro completos
colors:
  navy: "#1B3A5C"
  navy-600: "#24507E"
  navy-900: "#142B44"
  teal: "#0E8A7A"
  teal-strong: "#0B7466"
  teal-light: "#2AB39F"
  teal-lighter: "#5FD3C0"
  ink: "#141D2B"
  mid: "#4A6380"
  surface: "#F6F7F9"
  border: "#D8DDE5"
  ground-night: "#0B141F"
  raised-night: "#101C2A"
  sunken-night: "#0E1825"
  text-night: "#E6EDF4"
  mid-night: "#8FA7C0"
  success: "#16A34A"
  warning: "#D97706"
  error: "#DC2626"
  info: "#2563EB"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  page-title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  section-title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "1.25rem"
  meta:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "1.1rem"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "+0.06em"
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  base: "0.625rem"
  lg: "0.625rem"
  md: "0.375rem"
  sm: "0.25rem"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
  button-primary-active:
    backgroundColor: "{colors.navy-900}"
  link:
    textColor: "{colors.teal-strong}"
  focus-ring:
    backgroundColor: "{colors.teal}"
  nav-item-active-night:
    textColor: "{colors.teal-lighter}"
---

## Overview

Riuna es una plataforma de productividad autoalojada y de uso interno. Su modo es
**Operate**: quien la usa viene a completar una tarea, no a admirar la pantalla.
La escaneabilidad, la consistencia y la densidad ganan siempre a la expresión; la
marca vive en el detalle preciso, no en el gesto grande.

**La autoridad de este sistema es [`docs/marca.md`](../../docs/marca.md)**, un
manual con gobernanza propia (§09): sus secciones 01–07 las aprueba una sola
persona. Este fichero **documenta** ese sistema para herramientas y agentes; no lo
sustituye ni lo amplía. Donde los dos discrepen, manda el manual.

Tres pilares gobiernan cada decisión: **Claro** (el estado se lee de un vistazo),
**Fluido** (la herramienta no cobra peaje) y **Preciso** (la ambigüedad no se
disimula con colores bonitos).

## Colors

Seis valores de marca; todo lo demás se deriva. Los grises **no son grises**:
`#4A6380`, `#D8DDE5` y `#F6F7F9` llevan sesgo azul deliberado. No sustituir por la
escala `neutral` de Tailwind — un gris neutro al lado del navy delata que no se
eligió.

**Regla de oro: Navy sostiene. Teal actúa. Todo lo demás calla.** Si en una
pantalla hay más de un elemento en teal sólido compitiendo por ser la acción
principal, sobra uno. El tinte de interacción (hover, fila activa) va al 10–16 %
y no cuenta como teal sólido (ADR 007).

**Restricción de contraste, de obligado cumplimiento.** River Teal `#0E8A7A` da
4,25:1 sobre blanco, por debajo de AA. Sirve para trazo, icono, borde y anillo de
foco (umbral 3:1) y para titulares de 24 px o más. **No es color de texto de
párrafo.** Lo que lleva texto encima —o es texto— usa `teal-strong` `#0B7466`
(5,67:1). En tema oscuro el peso de marca lo lleva el teal claro: Deep Navy es más
oscuro que el propio fondo elevado y no funciona como acción.

Los tokens se consumen siempre por nombre semántico (`--primary`, `--ring`,
`--sidebar-accent`). **No hay ni un hex literal en los componentes, y debe seguir
así.**

**Colores de datos: sin cerrar.** `--chart-1..5` existen en `index.css` pero
`marca.md` §04 nunca los definió, y no derivan de la marca — el 4 es violeta
`#7C3AED` y el 5 rosa `#BE185D`. Es la única parte del sistema de color que sigue
abierta y está pendiente de propuesta.

## Typography

**Geist Variable** para todo, **Geist Mono Variable** para código e
identificadores. Se descartó Inter a propósito y por escrito: mismo registro
geométrico, y Geist trae monoespaciada de la misma familia, que Riuna necesita
para Shiki y Mermaid. Instrument Serif se descarta: no hay superficie editorial.

Riuna es **densa a propósito**. El cuerpo son 14 px, no 16: `text-sm` y `text-xs`
suman 796 de 890 usos de tamaño en el código. Eso no es herencia accidental, es la
escala correcta para un tablero de cincuenta tarjetas.

La escala tiene **siete papeles y ninguno más**: 30 · 20 · 16 · 14 · 12 · 11, más
13 para monoespaciada. Los titulares llevan `text-wrap: balance`; la prosa larga
se limita a unos 65 caracteres de medida.

## Layout

Barra lateral y cabecera en `surface` con bordes de 1 px; el trabajo va sobre
fondo de página. El chrome calla, el contenido manda.

El tiempo es una vista, no un módulo: calendario, Gantt y ciclos son lentes sobre
las mismas tareas, no secciones con lógica propia. El panel es una rejilla de 12
columnas con widgets de `span` 1–3, reordenables por arrastre.

Radio base 0,625 rem. El móvil es **consulta**: se mira, no se trabaja.

## Elevation & Depth

Elevación mínima y por superficie, no por sombra dramática. En claro, las
superficies se separan con borde de 1 px y `surface` contra blanco. En oscuro hay
tres planos —hundido `#0E1825`, fondo `#0B141F`, elevado `#101C2A`— y el borde es
blanco al 8 %.

El fondo oscuro nunca es negro neutro: lleva el mismo sesgo azul que el resto.

## Shapes

Esquinas suaves y consistentes desde `--radius: 0.625rem`. Iconografía **Lucide**,
trazo de 1,5 px, tamaños de 12 px (`size-3`) y 14 px (`size-3.5`) en las zonas
densas. **Sin emoji como icono funcional.**

El estado se codifica en **forma, no solo en color**: icono más color más texto.
Nadie debe depender del tono para saber si una tarea es urgente.

## Components

Base UI y primitivas derivadas de shadcn, con los tokens de arriba. Piezas
compartidas que ya existen y deben reutilizarse antes de crear ninguna:
`SegmentedControl` (ADR 028), `StatTile`, las primitivas de gráfica de
`components/charts/chart-primitives.tsx`, y `WidgetCard`, que expone cada widget
como región con nombre accesible.

Botón primario en navy con texto blanco; el teal queda para enlace, foco y trazo.
Los estados de interacción tiñen con teal a baja opacidad, nunca con navy.

## Do's and Don'ts

**Hazlo**

- Saca los colores de tokens semánticos, nunca de hex escritos a mano.
- Deja el teal sólido para **una** acción por pantalla.
- Comprueba 4,5:1 en texto y 3:1 en componentes **en los dos temas**, medido.
- Usa las siete medidas de la escala y ninguna más.
- Codifica el estado con icono + color + texto.
- Usa claves estáticas de i18n; castellano y catalán cuentan igual.

**No lo hagas**

- No uses River Teal como color de texto de párrafo (4,25:1 sobre blanco).
- No metas Deep Navy como color de acción en tema oscuro.
- No sustituyas los neutros con sesgo azul por grises neutros de Tailwind.
- No uses esmeralda para «éxito»: choca con el teal a doce grados de tono.
- No añadas tamaños fuera de escala.

**Desviaciones medidas hoy, para que no se copien** (2026-09-09, con el detector
de impeccable y medición directa del DOM):

- **`text-[10px]` en 61 sitios**, y 39 elementos a 10 px solo en el tablero —
  números de tarea y chips de fecha. La escala no tiene papel de 10 px: el suelo
  es 11 px. Hay además un 9 px y doce elementos a 15 px.
- **Los títulos de sección se pintan a 14 px con peso 500**, no a 16 px con 600.
  Como el cuerpo también son 14 px, un título de widget es tipográficamente
  idéntico al texto que lo rodea.
- **Prosa de hasta ~149 caracteres por línea** en los ajustes, contra la medida de
  ~65 que fija el manual.
- El texto de ayuda del buscador **sangra hasta el borde del viewport**.
- El panel salta de `<h1>` a `<h3>` sin `<h2>`.

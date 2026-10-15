# ADR 092 — Wiki de páginas

**Fecha:** 2026-10-15 · **Estado:** aceptada

**Contexto.** Tanda 5 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado):
un sitio para lo que no es una tarea —procedimientos, actas, contactos— enlazado con las tareas.
El interludio ya decidió que fueran páginas simples con el editor de siempre, historial y aviso si
otro guarda mientras editas, y que la edición simultánea con Yjs quedara fuera. El aspecto es el
de [la maqueta](../design-previews/ideas-openproject.html) aprobada, pestaña «Wiki».

**Decisión.**

- **Tres tablas nuevas** (migración 0095), y nada se reescribe:
  - `wiki_page`: árbol por `parent_id`. Sin proyecto es una página del espacio; con proyecto, del
    proyecto. Lleva el contenido en el mismo Markdown que la descripción de una tarea y un
    `version` entero;
  - `wiki_page_version`: el contenido **completo** de cada versión, con su autor, su nota y, si es
    una restauración, de cuál viene. Las páginas son pequeñas y las diferencias se calculan al
    leerlas;
  - `wiki_link`: los enlaces página ↔ tarea, con su origen (`page` o `task`) e índice por tarea.
    Lo rehacen las escrituras: la de la página y la de la descripción de la tarea. No se busca
    con `LIKE` en 50.000 descripciones.
- **Permisos sin vocabulario nuevo** (decisión del usuario): leer, cualquiera del espacio; crear,
  editar, mover y borrar, `task:update`. Un middleware `fromWikiPage` nuevo, como `announcement`.
- **Bloqueo optimista**: cada guardado manda la versión de la que partió. Si otra persona guardó
  antes, la API responde 409 y no toca nada. La web suele saberlo antes, por el aviso en tiempo
  real, y saca «X guardó esta página…, mientras la editabas», con *Ver diferencias*, *Guardar
  encima de la suya* y *Descartar lo mío*. Guardar encima es reenviar con la versión de la otra
  persona: queda en el historial, no se pierde nada.
- **Mientras se edita, nada va al servidor**: el borrador vive en el `localStorage` del navegador
  y, al volver, se ofrece recuperarlo. «Guardar» crea la versión, con una nota opcional.
  Restaurar una versión crea otra nueva con su contenido.
- **Borrar una página con subpáginas pregunta** (decisión del usuario): toda la rama, o solo esa
  página, y sus hijas suben un nivel.
- **Enlaces desde el editor**: comandos `/` para enlazar una tarea —el nodo `riunaIssueLink` que
  ya existía— o una página —uno nuevo, `riunaPageLink`, que va y vuelve por Markdown como
  `<riuna-page-link>`—. Valen en la wiki y en la descripción de la tarea. La página dice qué
  tareas la enlazan y la tarea, qué páginas. Una URL suelta de una tarea también enlaza: lo que
  llega por la API o el MCP no pasa por el editor, que es quien la convierte en ficha.
- **Las menciones avisan** (decisión del usuario), como en los comentarios, solo la primera vez
  que alguien aparece en esa página. Es un tipo nuevo, `wiki_mention`, con la preferencia de los
  comentarios.
- **Los adjuntos de una página nunca son públicos**, aunque su proyecto lo sea, y se borran con
  ella. No se borran al guardar: las versiones viejas los siguen nombrando.
- **El tiempo real va por el canal de usuario**, a cada miembro del espacio: el de proyecto valida
  un esquema estricto que con Redis perdería los campos nuevos.
- **El editor de la descripción pasa a ser un componente propio**, `rich-markdown-editor`, que
  usan la tarea y la wiki. Commit aparte y sin cambio de comportamiento.
- **Se entra desde la pestaña «Wiki»** de cualquier proyecto, que enseña también las páginas del
  espacio, y desde la búsqueda global y la paleta. No hay entrada en la barra lateral (decisión
  del usuario).
- **MCP**: `list_wiki_pages`, `get_wiki_page`, `search_wiki` y `create_wiki_page`, de modo que
  pasan a ser 69 herramientas.

**Consecuencias.**

- Sin dependencias nuevas: el diff por líneas es un LCS propio de unas 70 líneas.
- Medido con 50.000 tareas y 3.000 páginas de 4 KB, diez veces una wiki realista:
  - las páginas de una tarea, el árbol y los enlaces de una página, menos de 3 ms;
  - la búsqueda recorre el contenido con `ilike`, sin índice: 130 ms.
  - Crece en línea con el texto. Si algún día se queda corta, la salida es un índice `pg_trgm`.
- Una página lleva hasta 500.000 caracteres. El historial guarda cada versión entera, sin
  recortar: con páginas de texto, ocupa poco.
- Dos personas no escriben a la vez en la misma página: la segunda elige entre guardar encima y
  descartar. Yjs se reconsidera solo si la wiki se usa de verdad.

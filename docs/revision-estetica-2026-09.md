# Revisión estética · septiembre 2026

Revisión de las 24 pantallas con dos sistemas externos —
[impeccable](https://github.com/pbakaus/impeccable) 4.3.1 y
[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — contra
`docs/marca.md`, que sigue siendo la autoridad.

## Cómo se hizo

Ambas skills se instalaron **a nivel de usuario** (`~/.claude/skills/`), no en el
repo: traen 22 MB de fuentes, CSV y binarios que no tienen por qué versionarse con
Riuna. Los *hooks* globales de impeccable quedaron sin instalar a propósito
(`--no-hooks`): se dispararían en todos los proyectos, no solo en este.

Tres barridos:

1. **Detector estático** sobre `apps/web/src` — 2 avisos, ambos falsos positivos
   (ver abajo).
2. **Detector de runtime** sobre la aplicación en marcha, ruta por ruta, con el
   motor nativo de impeccable sobre un perfil de Chrome con sesión iniciada:
   **20 rutas a 1440 px (533 hallazgos) y 5 a 390 px (113)**. El lote de URLs
   infravalora —1 hallazgo por ruta frente a 58 en solitario, porque no espera al
   render—, así que cada ruta se escaneó por separado.
3. **Medición directa del DOM**: tamaños de fuente, colores computados y muestreo
   de píxeles para el contraste.

Contra una base aislada (`riuna_e2e_test`), nunca contra datos reales.

## La mezcla: quién gana en cada punto

### Gana `marca.md`

**`ai-color-palette` × 162 — «cyan neon sobre fondo oscuro».** Es River Teal. El
producto se llama Riuna porque suena a río, y la paleta se llama Deep Navy y River
Teal por eso mismo; está derivada con razonamiento de contraste y cerrada en la
ADR 007. Un detector entrenado contra plantillas de SaaS no puede distinguir una
marca deliberada de un tic generativo, y aquí se equivoca.

*El matiz que sí acepto:* de las 162, solo **tres** son teal como texto —
`#5FD3C0` en «Vista general», «Panel» y «Proyectos»—. El resto son iconos, bordes
y tintes. `#5FD3C0` es el uso más brillante del sistema y ocupa el momento de
marca más repetido de la interfaz. No lo cambio; lo dejo anotado.

**`flat-type-hierarchy` — la escala es plana.** Lo es a propósito: Riuna es densa
y el manual lo argumenta. Pero ver el punto siguiente, porque el hallazgo apuntaba
a algo real por debajo.

### Gana la herramienta, y contra el propio manual

Estos no son choques de criterio: son sitios donde **el código se ha desviado de
`marca.md`** y el detector lo vio antes que nosotros.

**Tamaños fuera de escala.** La escala tiene siete papeles: 30 · 20 · 16 · 14 · 12
· 11, más 13 monoespaciada. Medido en el DOM:

| Pantalla | Tamaños en uso |
|---|---|
| Panel | 9:1 · **10:31** · 11:16 · 12:19 · 14:42 · 16:13 · **18:2** · 20:1 |
| Tablero | 9:1 · **10:39** · 12:27 · 14:29 · **15:12** · 16:7 |

`text-[10px]` aparece **61 veces en el código**. En el tablero son los números de
tarea y los chips de fecha — texto funcional, no adorno. impeccable lo marca por
su suelo de legibilidad de 11 px; el manual lo marca porque ese papel no existe.
**Dos autoridades independientes coinciden.**

**Los títulos de sección se pintan como cuerpo.** El manual dice 16 px peso 600.
Medido: `H3 14px w500`. Como el cuerpo también son 14 px, **el título de un widget
es tipográficamente idéntico al texto que lo rodea**: la jerarquía solo la sostiene
el peso. Esto es lo que había realmente debajo del `flat-type-hierarchy`.

**Medida de línea.** El manual fija ~65 caracteres para prosa larga. Medido: hasta
**~149** en los ajustes de flujo de trabajo y del espacio, ~144 en notificaciones.

**El texto de ayuda del buscador sangra hasta el borde del viewport** (9 px). Lo
había visto a ojo ayer; ahora está medido.

**El panel salta de `<h1>` a `<h3>`** sin `<h2>`. Un lector de pantalla pierde el
nivel intermedio. Parte es consecuencia de haber convertido los títulos de widget
en `<h3>` para darles nombre accesible.

### Coinciden las tres fuentes

ui-ux-pro-max (`charts.csv`): *«never distinguish series by hue alone»*.
`marca.md` §06: *«El estado se codifica en forma, no solo en color»*.

Las gráficas de Riuna distinguen las series **solo por color** — y encima cuatro
de cada cinco colores no se pintan. Ver `## La paleta de datos`.

## Descartado tras verificar

impeccable pide comprobar antes de reportar. Esto no pasó el filtro:

- **`low-contrast` en las cabeceras del calendario** (8 hallazgos, «1,1:1 sobre
  backdrop filter»). Muestreo de píxeles real: **7,47:1**, exactamente el 7,5:1 que
  el manual documenta para `#8FA7C0`. El 1,1:1 es el borde antialiasado de los
  glifos; la mediana que reporta promedia esos bordes. Falso positivo.
- **`side-tab` × 2** (`border-l-4`, detector estático). Son indicadores de zona de
  arrastre (`showDropIndicator`), no pestañas decorativas. Falso positivo.
- **`low-contrast` en «Group»** del tablero: es el botón «Agrupar» deshabilitado, y
  WCAG exime los controles deshabilitados.
- **`nested-cards` × 108** y **`layout-transition` × 131**: mayoritariamente
  estructura de paneles de Base UI y la transición de anchura deliberada de las
  barras de progreso. Ruido a la escala de este producto.

## La paleta de datos

**El único hueco real del sistema de color.** `marca.md` §04 cierra marca, escala
derivada, tema oscuro, semánticos y los nueve colores de etiqueta — y de gráficas
no dice nada. Lo que hay en `index.css` es esto:

```
--chart-1: var(--riuna-teal)   ✔ de marca
--chart-2: #2a5c8a             ~ azul, no derivado
--chart-3: #d97706             = warning, colisiona de significado
--chart-4: #7c3aed             ✘ violeta
--chart-5: #be185d             ✘ rosa
```

Violeta y rosa son precisamente los dos tonos que impeccable marca como delator de
interfaz generada, y ninguno sale de Deep Navy ni de River Teal. Además `--chart-3`
es exactamente el color de aviso, así que un cubo cualquiera de un reparto parece
una advertencia.

Y encima **no funcionan**: viven en un bloque `@theme inline` que Tailwind poda, y
`chartColor()` los construye en tiempo de ejecución
(`var(--color-chart-${(index % 5) + 1})`), así que solo sobrevive el 1 —el único
que aparece escrito literalmente en el código—. Los otros cuatro resuelven a
transparente. Comprobado en `:root`: `--color-chart-2..5` valen cadena vacía.

Resultado en pantalla: en un reparto de seis proyectos, **cuatro barras negras**.

## Inventario

### P0 · se ven en el panel de cualquiera — **corregidos**

1. ~~**Cuatro de cada cinco series de gráfica no se pintan.**~~ **Hecho.**
   Paleta de ocho tonos derivada y validada (`marca.md` §04), `chartColor`
   apuntando a `--chart-N`, sin ciclado, con cola en «otros». Verificado en
   navegador: seis barras, seis colores, en los dos temas.
2. ~~**Toda gráfica de tendencia rotula su eje «Desconocido».**~~ **Hecho.**
   `effectiveGroupBy(type, config)` replica la tabla que el servidor resuelve en
   `resolveWidget` y que no guarda en el `config`.

### P1 · violan el manual o rompen la lectura — **corregidos**

3. ~~**`text-[10px]` en 61 sitios.**~~ **Hecho, y era más grande de lo medido:**
   119 tamaños arbitrarios en total, incluidos 8 px y 9 px. Repartidos por familia
   —chip, insignia e identificador a `text-label`; metadato a `text-meta`— más
   `text-lg` del StatTile a `text-page` y el título de tarea a `text-display`.
   **Cero `text-[Npx]` en el código.** Medido en pantalla: el panel pasa de
   `9·10·11·12·14·16·18·20` a `11·12·14·16·20`.
4. ~~**Títulos de sección a 14 px / 500.**~~ **Hecho.** `text-section` (16/600).
5. ~~**La tabla enseña los slugs.**~~ **Hecho.** `TableView` recibe las columnas
   del proyecto y resuelve `status` a su nombre, con el slug como último recurso
   si la columna se archivó.
6. ~~**Tres claves de i18n inexistentes.**~~ **Hecho**, en los tres idiomas.
7. ~~**Calendario y zona peligrosa sin traducir.**~~ **Hecho:** 26 cadenas en
   es-ES y 26 en ca-ES.
8. ~~**`Backlog` y `Tasks` a fuego en el JSX.**~~ **Hecho:** `tasks.backlog.title`
   y `tasks.board.title` en los tres idiomas. La barra lee ahora
   *Backlog · Tareas · Calendario · Gantt · Tabla · Ciclos*.
9. ~~**El panel salta de `<h1>` a `<h3>`.**~~ **Hecho:** los títulos de widget son
   `<h2>`.

### El hallazgo que destapó el arreglo tipográfico

Al pasar los chips a `text-label` **el tamaño no se aplicaba**: computaban a
16 px. La causa no estaba en el CSS sino en `cn()`.

tailwind-merge clasifica `text-*` por su valor. Los siete papeles de `marca.md`
§05 son nombres propios (`label`, `meta`, `section`…), no una escala que
reconozca, así que los metía en el **mismo grupo que `text-muted-foreground`** y
el tamaño **desaparecía en silencio** en cuanto un elemento llevaba las dos
cosas — o sea, en cada chip de estado y en cada título de tarea cerrada, que se
pintaban a 16 px sin que nadie viera un error.

Es la misma trampa del prefijo `text-` que documentó la ADR 018, por el otro
lado: allí un tamaño compilaba a color, aquí un tamaño se descartaba *como si*
fuera color.

Y había **dos `cn()`**: `lib/cn.ts` (109 ficheros) y `lib/utils.ts` (2, y solo
exportaba `cn`). El arreglo fue primero al que no era. Consolidado en `lib/cn.ts`
y `utils.ts` eliminado, porque dos implementaciones compitiendo es exactamente lo
que hizo perder el arreglo.

### P2 · coherencia y acabado — **parcialmente hecho**

12. ~~`suggestionBug`/`suggestionFeature` y `displayOptions`.~~ **Hecho:**
    «Errores», «Mejoras», «Opciones de vista».
13. ~~Nombres de columna en inglés en copia traducida.~~ **Hecho:** la copia ya no
    los nombra («…a la primera columna»), con su `¿` de apertura. **Queda abierto**
    que un proyecto nuevo se cree con columnas en inglés: eso son datos, no copia.
14. ~~El buscador del Gantt decía «tickets».~~ **Hecho.**

### P2 · segunda tanda — **corregidos**

10. ~~Medida de línea de hasta ~149 caracteres.~~ **Hecho, donde el manual lo
    pide.** §05 acota «la prosa larga (descripción de tarea, comentarios)», y ahí
    era peor de lo medido: la descripción iba a **736 px sin tope alguno**, o sea
    creciendo con la ventana. Ahora `max-width: 65ch` **en el párrafo**, no en el
    editor, para que tablas, bloques de código e imágenes sigan usando todo el
    ancho. Medido: 736 → 650 px. Las leyendas de ajustes se acotan en las
    primitivas compartidas de `settings-layout`; las que cada página escribe
    en línea siguen anchas, y son leyendas de escaneo, no prosa de lectura.
11. ~~El texto de ayuda del buscador sangra al borde.~~ **Hecho:** `p-4`, la
    convención del resto de pantallas de espacio.
13b. ~~Columnas nuevas en inglés.~~ **Hecho:** «Por hacer · En curso · En
    revisión · Hecha», los nombres que ya fijaba `marca.md` §06. **El slug no se
    traduce** —es lo que comparan `is_final`, el filtro de estado y la definición
    de «hecha»— y para que renombrar no rompiera la importación, `statusKeys`
    colapsa separadores: una hoja que diga «To Do» sigue entrando por el slug.
    19 pruebas de importación y 30 de autorización, en verde.
17. ~~Los tonos 4 y 5 bajo 3:1 sin relevo garantizado.~~ **Hecho, y de raíz:** el
    reparto pasa a **barras horizontales** con `interval={0}`. Los nombres de
    Riuna son largos —«Rediseño web», «Infraestructura»— y en vertical el eje se
    saltaba etiquetas, dejando la identidad solo en el color. Ahora cada barra
    dice quién es.
19. ~~La página de tarea no tenía `<h1>`.~~ **Hecho:** un `h1` sólo para lectores
    de pantalla nombra la tarea y etiqueta el `input` del título; «Actividad»
    baja a `h2`. De paso, su clase era `text-md`, que **no existe en Tailwind** y
    no pintaba nada.

### Lo que sigue abierto

18. **La escala del editor TipTap va aparte**: 28 `font-size` en CSS con valores
    propios (0,68 · 0,72 · 0,79 · 0,965 · 1,24 rem). Es una superficie de prosa
    con necesidades tipográficas distintas de la interfaz densa, así que se deja
    como excepción **acotada y declarada**, no como deriva.
20. **48 clases de tamaño de Tailwind fuera de los siete papeles**: `text-lg`
    (23), `text-2xl` (24) y `text-4xl` (1). Están en pantallas que esta revisión
    no recorrió —acceso, alta, invitaciones, proyecto público—, así que se
    quedan **medidas y acotadas** en vez de barridas a ciegas.
21. La búsqueda pinta `result.status` crudo, como hacía la tabla. Resolverlo
    cruza proyectos, así que necesita una consulta que hoy no se hace.
22. ~~`<h2>` de «Rama» en la tarea sigue a 14 px.~~ **Hecho (2026-10-03):** «Rama» y
    «Tiempo» usan `text-section`, como «Actividad».

### P2 bis · abierto por el arreglo de la paleta

17. **Los tonos 4 y 5 quedan bajo 3:1 sobre fondo claro** (2,11 y 2,62). La regla
    los admite con relevo —rótulo visible o vista de tabla— pero el eje se salta
    etiquetas cuando la tarjeta es estrecha: en un reparto de seis proyectos, la
    barra ámbar se queda sin rotular. O el eje rota las etiquetas, o el widget
    ofrece vista de tabla. **No** se arregla reordenando la paleta: el orden es el
    mecanismo de seguridad para daltonismo.

### P3 · anotado, decide quien manda

15. Las preferencias viven solo en `localStorage` y se pierden al cambiar de
    navegador, aunque la pantalla cuelgue de «Ajustes › **Cuenta**». De ahí sale
    también que el calendario empiece en domingo.
16. `#5FD3C0` como texto de estado activo en oscuro es el uso más brillante del
    sistema.

## Estado

Ficheros nuevos: `apps/web/PRODUCT.md` (verdad de producto, de la entrevista) y
`apps/web/DESIGN.md` (el sistema documentado en el formato que leen las
herramientas). Ninguno sustituye a `marca.md`: lo documentan.

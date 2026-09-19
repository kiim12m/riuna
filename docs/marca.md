# Riuna — Manual de marca

**Versión:** 0.1 (borrador para revisión) · **Fecha:** 2026-08-24

> Documento vivo. Es la fuente de verdad de los **valores** de marca: colores,
> tipografía, símbolo y tono. Cuando el código y este documento discrepen, gana
> este documento y el código se corrige — salvo en la sección [08](#08--decisiones-abiertas),
> donde lo que hay son propuestas todavía sin aprobar.
>
> Complementarios: [plan de desarrollo](plan.md) · [decisiones (ADR)](adr/) ·
> [espécimen visual](https://claude.ai/code/artifact/69891cf0-770f-40de-b122-9ba65cc5edc2)
> (símbolo, muestras de color, escala tipográfica y la vista previa comparada del
> mapeo — renderiza lo que este documento especifica, no lo sustituye).

---

## 00 · Cómo usar este documento

Está escrito a partir de un *brand system* de partida (Riuna Brand System v1.0,
mayo 2026) que describe un producto distinto del que existe: un **constructor de
diagramas de proceso** con lienzo colaborativo y nodos Inicio / Tarea / Decisión
/ Fin. Riuna, hoy, es un fork de Kaneo: una plataforma de productividad con
tablero, lista, backlog, calendario y Gantt.

La decisión ha sido **quedarse con la capa visual y el tono, y reescribir la capa
de producto y de mensaje** para que hablen del programa real. El [anexo](#anexo--trazabilidad-con-el-documento-de-partida)
detalla qué se ha conservado, qué se ha derivado y qué se ha descartado.

Riuna es **interno y autoalojado**: no hay web de marketing, ni landing, ni
material comercial. Toda la marca se expresa dentro de la aplicación y en los
documentos del repositorio. Eso hace que las secciones fuertes de este manual
sean color, tipografía, iconografía y tono de interfaz; y que no haya sección de
publicidad, campañas ni redes.

---

## 01 · Qué es Riuna

### Definición

Riuna es una plataforma de productividad autoalojada y de uso interno. Reúne en
un solo sitio el trabajo que hoy se reparte entre varias herramientas: gestión de
proyectos y tareas primero, CRM y ERP ligero después.

### Propósito

Que un equipo pequeño vea el estado real de su trabajo sin tener que reconstruirlo
mentalmente a partir de cinco pestañas.

### Claim (propuesta, pendiente de aprobar)

> **Un solo cauce para todo el trabajo.**

Dice las dos cosas que definen el producto: que es **uno solo** (frente a la
dispersión de herramientas) y que el trabajo **corre** por él. Y sostiene el
nombre: Riuna suena a río, y el sistema de color se llama Deep Navy y River Teal
precisamente por eso.

Alternativa más corta para usos ajustados (pestaña, cabecera, correo):
**El trabajo, a la vista.**

### Pilares

| Pilar       | Qué significa dentro de Riuna                                                                 |
|-------------|-----------------------------------------------------------------------------------------------|
| **Claro**   | El estado del trabajo se lee de un vistazo. Si hay que abrir algo para saber cómo va, es un fallo de diseño. |
| **Fluido**  | La herramienta no cobra peaje. Crear, mover y cerrar una tarea son gestos, no formularios.     |
| **Preciso** | Cada tarea tiene responsable, fecha y permiso exactos. La ambigüedad no se disimula con colores bonitos. |

Estos tres pilares vienen del documento de partida (*Clear · Fluid · Precise*) y
se mantienen porque describen igual de bien un gestor de trabajo que un editor de
diagramas. Lo que cambia es a qué se aplican.

### Lo que la marca no es

- No es una marca de producto público. No hay tono comercial ni promesa de venta.
- No es minimalismo decorativo. Riuna es **denso a propósito**: la interfaz usa
  14 px de cuerpo y 12 px de metadatos porque el trabajo cabe mejor en pantalla.
- No hereda de Kaneo nada más que el código. Ni el logotipo, ni el tono, ni la
  paleta ([ADR 001](adr/001-fork-duro-de-kaneo.md)).

---

## 02 · Personalidad y tono de voz

Riuna habla **claro y en corto**. Es profesional sin ser corporativo, y preciso
sin ser frío. Trata a quien lo usa de tú.

### Reglas

1. **Frase corta, verbo delante.** «Crea un proyecto», no «Aquí podrás proceder a
   la creación de un proyecto».
2. **Di qué ha pasado, no cómo de bien ha pasado.** «Proyecto creado» basta.
3. **Los errores explican la causa y la salida.** Nunca se disculpan.
4. **Sin jerga sin explicar.** Si aparece un término técnico (webhook, MCP, clave
   de API), va acompañado de qué hace.
5. **Sin emoji, sin exclamaciones, sin humor.** No porque esté prohibido divertirse,
   sino porque una interfaz que se lee cien veces al día se cansa antes que quien la lee.
6. **Mayúscula solo al principio.** «Ver proyecto», no «Ver Proyecto».

### Vocabulario de producto

El término de la interfaz manda sobre el del código. En el código todo sigue en
inglés ([ADR 003](adr/003-idioma.md)).

| Concepto (código)   | En la interfaz            | No decir                        |
|---------------------|---------------------------|---------------------------------|
| `workspace`         | espacio de trabajo        | organización, cuenta, workspace |
| `project`           | proyecto                  | tablero                         |
| `task`              | tarea                     | ticket, issue, incidencia       |
| `column`            | columna                   | estado, lista, swimlane         |
| `label`             | etiqueta                  | tag, marcador                   |
| `team`              | equipo                    | grupo, departamento             |
| `assignee`          | responsable / asignado    | owner, dueño                    |
| `activity`          | actividad                 | historial, log, auditoría       |
| `backlog`           | backlog                   | pendientes, pila                |

«Backlog» se queda en inglés porque el equipo ya lo usa así y traducirlo crearía
más fricción que la que resuelve.

### Correcciones pendientes en las cadenas actuales

Estos son fallos reales de `i18n/es-ES.json`, no ejemplos inventados. Sirven de
calibración de lo que este manual considera correcto:

| Actual                                              | Debería ser                       | Por qué                                        |
|-----------------------------------------------------|-----------------------------------|------------------------------------------------|
| «Proyecto creado satisfactoriamente»                | «Proyecto creado»                 | Calco de *successfully*. Sobra.                |
| «Hubo un error al crear el proyecto»                | «No se ha podido crear el proyecto» | Di qué ha fallado, no que hubo un error.     |
| «Crea un nuevo proyecto en tu espacio de trabajo…»  | «Crea un proyecto en tu espacio de trabajo…» | «Nuevo» es redundante con «crea».  |
| «Ver Proyecto» · «Compartir Proyecto»               | «Ver proyecto» · «Compartir proyecto» | Mayúscula solo al principio.              |
| «Enlace al proyecto copiaro al portapapeles»        | «Enlace copiado»                  | Errata, y sobra la mitad de la frase.          |
| «Tema día» · «Tema noche»                           | «Tema claro» · «Tema oscuro»      | Son los nombres que usa todo el mundo.         |

No están corregidas todavía: la revisión de las 1.960 claves es trabajo aparte
(ver [08](#08--decisiones-abiertas)).

---

## 03 · Símbolo y logotipo

### Concepto

Un anillo partido en diagonal y dos nodos en el corte. El arco superior
izquierdo, en Deep Navy, es la **estructura**: el proyecto, la fecha, el permiso.
El inferior derecho, en River Teal, es el **movimiento**: la tarea que avanza.

**Cada nodo es el negativo del otro.** Donde el trabajo entra, el nodo lleva navy
fuera y teal dentro; donde sale, teal fuera y navy dentro. Eso hace tres cosas a
la vez: termina las dos junturas —un anillo con un solo nodo se lee como
inacabado—, da dirección a una figura que por ser circular no la tendría, y
consigue que los dos colores estén en los dos extremos en lugar de repartirse la
figura por mitades limpias.

Los nodos no son decorativos: Riuna relaciona tareas entre sí (dependencias,
subtareas, y el árbol de la Fase 2), y el símbolo dice exactamente eso. El corte
va en diagonal, no en vertical ni en horizontal, para que la figura tenga eje.

### Construcción

Retícula de 32 unidades. Anillo de radio 10 centrado en (16, 16), cortado a 135°
y a 315° —ángulos de pantalla, 0° a la derecha—, es decir en los puntos
(8,93 · 23,07) y (23,07 · 8,93).

| Elemento           | Valor                                        |
|--------------------|----------------------------------------------|
| Arco navy          | de 135° a 315° por arriba, trazo 2,6         |
| Arco teal          | de 315° a 135° por abajo, trazo 3,6          |
| Nodo               | radio 3,7                                    |
| Núcleo             | radio 2,1, del color contrario                |
| Nodo simplificado  | radio 3,9, macizo, sin núcleo                 |
| Terminaciones      | redondas, como la iconografía ([07](#07--iconografía)) |

El arco teal es más grueso que el navy a propósito: refuerza la dirección sin
añadir ningún elemento. La estructura es el marco, el movimiento tiene el cuerpo.

### Comportamiento al reducir

**El núcleo deja de caber por debajo de unos 32 px.** No es un defecto que se
pueda corregir agrandándolo —se come el nodo y deja un aro que se rompe antes—,
así que el símbolo tiene dos niveles de detalle y hay que usar el que toque:

| Tamaño   | Versión                                                    |
|----------|------------------------------------------------------------|
| ≥ 32 px  | Completa: nodos con núcleo del color contrario              |
| < 32 px  | Simplificada: nodos macizos, navy el de entrada, teal el de salida |

La simplificada conserva lo esencial —el anillo bicolor y la dirección por
color—; lo que pierde es el juego del negativo. Está en `public/favicon.svg` y en
las entradas de 16 y 32 px del `.ico`.

### Generación de los mapas de bits

Los PNG e ICO se dibujan desde la geometría, no rasterizando el SVG: no hay
rasterizador en el entorno de desarrollo, así que `scripts/brand/render-icons.mjs`
los resuelve analíticamente y sin dependencias.

```bash
node scripts/brand/render-icons.mjs apps/web/public
```

La geometría vive en **tres sitios** y hay que cambiarla en los tres a la vez:
el script de arriba, `apps/web/public/favicon.svg` y
`apps/web/src/components/common/logo.tsx`.

### Variantes

| Variante           | Fondo         | Uso                                                  |
|--------------------|---------------|------------------------------------------------------|
| Lockup principal   | Claro         | Uso por defecto: cabecera, pantallas de acceso        |
| Invertido          | Oscuro / navy | Tema oscuro de la aplicación                          |
| Monocromo navy     | Claro         | Impresión a un color, documentos                      |
| Monocromo blanco   | Oscuro        | Sobre fotografía o fondo saturado                     |
| Símbolo suelto     | Cualquiera    | Favicon, avatar, icono de aplicación                  |
| **Ampliada**       | Cualquiera    | Ver abajo. No es la marca por defecto                 |

En monocromo el negativo se invierte igual: el núcleo se pinta del color del
fondo, no del contrario, porque no hay contrario.

### Variante ampliada

Dos arcos más, fuera del anillo y sin tocarlo, uno por color y cada uno en su
lado: el navy arriba a la izquierda, el teal abajo a la derecha, ambos de 60° a
radio 13,6 y trazo 2,2. El símbolo pasa a ser **dos anillos partidos por la misma
diagonal**, el interior cerrado y con nodos, el exterior abierto.

No sustituye a la marca: **es la versión que se despliega cuando hay sitio** —una
portada, una pantalla de carga, el icono grande, material impreso—. Por debajo de
24 px los dos arcos exteriores se quedan en dos pelos de trazo que solo ensucian,
así que en interfaz y en favicon va siempre la marca sin ellos.

Está especificada pero **no implementada**: cuando haga falta, se añade al
símbolo existente sin tocar nada más.

### Logotipo

«riuna» en minúsculas, Geist Semibold (600), interletrado −0,03 em, en Deep Navy.
Se separa del símbolo por media altura de la x.

Nunca en mayúsculas, nunca «RIUNA», nunca con la primera en mayúscula dentro de
la interfaz. En prosa (este documento, los ADR) sí se escribe «Riuna», porque
ahí es un nombre propio y no el logotipo.

### Usos prohibidos

- Recolorear los arcos o los núcleos con cualquier par que no sea navy/teal.
- Igualar los dos nodos: sin el negativo, la figura pierde la dirección.
- Rotar o reflejar el símbolo: la diagonal del corte es parte del diseño.
- Cerrar el anillo o rellenarlo.
- Usar la variante ampliada por debajo de 24 px.
- Poner el lockup sobre una imagen sin una zona de reserva sólida.
- Añadir sombra, degradado o brillo.

### Zona de reserva

Como mínimo, el diámetro de un nodo (7,4 unidades de la retícula de 32, un 23 %
del ancho del símbolo) por los cuatro lados. Con la variante ampliada se mide
desde el arco exterior, no desde el anillo.

---

## 04 · Color

### Paleta de marca

Seis valores, tomados sin cambios del documento de partida. Son los únicos
colores que definen la marca; todo lo demás de esta sección se deriva de ellos.

| Token      | Nombre     | Hex       | RGB           | Sobre blanco |
|------------|------------|-----------|---------------|--------------|
| `navy`     | Deep Navy  | `#1B3A5C` | 27, 58, 92    | 11,6:1       |
| `teal`     | River Teal | `#0E8A7A` | 14, 138, 122  | 4,25:1       |
| `ink`      | Text Dark  | `#141D2B` | 20, 29, 43    | 16,3:1       |
| `mid`      | Mid Gray   | `#4A6380` | 74, 99, 128   | 6,2:1        |
| `surface`  | Surface    | `#F6F7F9` | 246, 247, 249 | —            |
| `border`   | Border     | `#D8DDE5` | 216, 221, 229 | —            |

**Los grises no son grises.** `#4A6380`, `#D8DDE5` y `#F6F7F9` llevan sesgo azul.
Esto es deliberado y hay que respetarlo: un gris neutro puro al lado del navy
delata que no se eligió. No sustituir por la escala `neutral` de Tailwind.

### Significado

- **Deep Navy** — estructura, fiabilidad, profundidad. Es el color del *chrome*:
  lo que sostiene, no lo que llama.
- **River Teal** — energía, movimiento, acción. Es el color de lo que se puede
  hacer: un botón, un enlace, un foco, una fila activa.
- La inspiración es agua profunda y cauce natural. Por eso la paleta es fría y
  la única temperatura cálida del sistema llega por los colores semánticos.

### Restricción de contraste del teal — importante

River Teal da **4,25:1 sobre blanco** y **3,97:1 sobre `surface`**. Ambos por
debajo del 4,5:1 que exige WCAG AA para texto normal.

Consecuencias, y son de obligado cumplimiento:

- **River Teal no es un color de texto de párrafo.** Vale para iconos, bordes,
  trazos, componentes de interfaz (umbral 3:1) y titulares de 24 px o más.
- **Texto blanco sobre teal necesita un teal más oscuro.** Un botón relleno usa
  `teal-600` `#0B7466`, que da 5,67:1 con texto blanco. La diferencia entre los
  dos tonos no se aprecia a simple vista, pero es la que separa accesible de no
  accesible.
- Para texto teal sobre fondo claro (enlaces en prosa), usar también `#0B7466`:
  5,5:1 sobre blanco.

### Escala derivada

Necesaria para estados de interacción; no forma parte de la marca, sirve al
sistema.

| Token       | Hex       | Uso                                                    |
|-------------|-----------|--------------------------------------------------------|
| `navy-600`  | `#24507E` | Navy sobre fondo oscuro, hover de superficies navy      |
| `navy-800`  | `#1B3A5C` | **Base.** `--primary`                                   |
| `navy-900`  | `#142B44` | Estado pulsado                                          |
| `teal-400`  | `#14A896` | Hover de trazo e icono                                  |
| `teal-500`  | `#0E8A7A` | **Base.** Trazo, foco, icono, borde, tinte de hover     |
| `teal-600`  | `#0B7466` | Relleno con texto encima, texto teal sobre fondo claro  |
| `teal-300`  | `#2AB39F` | Solo tema oscuro                                        |
| `teal-200`  | `#5FD3C0` | Texto del estado activo en tema oscuro                  |

### Tema oscuro

El documento de partida no define paleta oscura y Riuna tiene tema claro y
oscuro completos. Estos valores son derivados: el fondo no es negro neutro sino
un casi-negro con el mismo sesgo azul que el resto del sistema.

| Rol                    | Hex                    | Contraste sobre el fondo |
|------------------------|------------------------|--------------------------|
| Fondo                  | `#0B141F`              | —                        |
| Superficie elevada     | `#101C2A`              | —                        |
| Barra lateral          | `#0E1825`              | —                        |
| Borde                  | blanco al 8 %          | —                        |
| Texto                  | `#E6EDF4`              | 15,7:1                   |
| Texto secundario       | `#8FA7C0`              | 7,5:1                    |
| Acento (River Teal)    | `#2AB39F`              | 7,1:1                    |
| Navy como superficie   | `#1F4066`              | —                        |

**Deep Navy no funciona como color de acción en tema oscuro** — es más oscuro
que el propio fondo elevado. En oscuro, el peso de marca lo lleva el teal claro
y el navy se retira a superficies y chips.

### Colores semánticos

Derivados. Elegidos para no confundirse con la paleta de marca.

| Rol       | Relleno   | Texto sobre claro | Nota                                                     |
|-----------|-----------|-------------------|----------------------------------------------------------|
| Éxito     | `#16A34A` | `#15803D`         | **Verde, no esmeralda.** Ver aviso abajo.                |
| Aviso     | `#D97706` | `#B45309`         | Única temperatura cálida del sistema.                     |
| Error     | `#DC2626` | `#B91C1C`         | —                                                         |
| Info      | `#2563EB` | `#1D4ED8`         | Azul brillante, lejos del navy.                           |

**Aviso sobre el verde de éxito.** La aplicación usa hoy `emerald-500` para
éxito. Con River Teal como color de acción, esmeralda y teal quedan a doce grados
de tono: un usuario no distingue «esto es un botón» de «esto ha salido bien». El
éxito se desplaza a verde puro (`#16A34A`, 142°) para que la diferencia sea
inequívoca.

### Colores de datos

Las nueve etiquetas de `apps/web/src/constants/label-colors.ts` se mantienen: son
colores que elige quien usa Riuna, no la marca, y van siempre sobre un chip
neutro. Una excepción: **«Sage» apunta a `emerald-600` y colisiona con el teal**
igual que el verde de éxito. Debe reapuntarse.

### Paleta de gráficas — propuesta, pendiente de aprobar

Esta sección no existía, y era el único hueco del sistema de color. Lo que había
en `index.css` no derivaba de la marca —violeta `#7C3AED` y rosa `#BE185D`— y el
tercer tono era exactamente el color de aviso, así que un cubo cualquiera de un
reparto parecía una advertencia.

**Ocho tonos, en orden fijo.** El orden *es* el mecanismo de seguridad para
daltonismo: no se reordena para que quede más bonito. El primero es River Teal,
para que la serie principal sea de marca; los siete restantes salen de una paleta
validada, no elegidos a ojo.

| Slot | Tono       | Claro     | Oscuro    |
|------|------------|-----------|-----------|
| 1    | Teal       | `#0E8A7A` | `#1FA891` |
| 2    | Naranja    | `#EB6834` | `#D95926` |
| 3    | Azul       | `#2A78D6` | `#3987E5` |
| 4    | Ámbar      | `#EDA100` | `#C98500` |
| 5    | Magenta    | `#E87BA4` | `#D55181` |
| 6    | Verde      | `#008300` | `#008300` |
| 7    | Violeta    | `#4A3AA7` | `#9085E9` |
| 8    | Rojo       | `#E34948` | `#E66767` |
| —    | «Otros»    | `mid`     | `mid-night` |

El tema oscuro **no es un volteo automático**: son los mismos ocho tonos
escalonados para el fondo oscuro. El teal baja a `#1FA891` porque `teal-300` se
sale por arriba de la banda de luminosidad del modo oscuro (L 0,69 sobre un techo
de 0,67).

Verificado con el validador de la skill `dataviz` en los dos temas: banda de
luminosidad, suelo de croma, separación bajo protanopia y deuteranopia (ΔE OKLab
×100 ≥ 8), suelo de visión normal (≥ 15) y contraste sobre superficie.

**Tres cosas que no son negociables aquí:**

1. **No se cicla.** A partir del noveno la cola va al neutro de «otros», que es lo
   que el agregado ya suma aparte. Repetir un tono haría que dos series
   compartieran identidad, que es peor que no distinguirlas.
2. **El color va con la entidad, nunca con su posición.** Un filtro que cambia el
   número de series no puede repintar las que sobreviven.
3. **Los colores semánticos están reservados.** Éxito, aviso, error e info no se
   reutilizan como «serie 4», y siempre llevan icono y texto.

El 4 y el 5 quedan por debajo de 3:1 sobre fondo claro. La regla los admite solo
con relevo —rótulo visible o vista de tabla—, y hoy el eje se salta etiquetas
cuando la tarjeta es estrecha. Queda anotado en
[la revisión estética](revision-estetica-2026-09.md), no resuelto.

### Regla de oro

> Navy sostiene. Teal actúa. Todo lo demás calla.

Si en una pantalla hay más de un elemento en teal compitiendo por ser la acción
principal, sobra uno.

**Matiz desde la [ADR 007](adr/007-teal-en-los-estados-de-interaccion.md).** Los
estados de interacción —hover, fila activa, elemento seleccionado— llevan River
Teal a baja opacidad, entre el 10 % y el 16 %. La regla de «una sola por
pantalla» se aplica al teal **sólido**: botón, enlace y anillo de foco. El tinte
de interacción no cuenta, pero no es gratis: si en una pantalla el ojo va antes
al hover que a la acción, sobra tinte.

---

## 05 · Tipografía

### Familias

| Rol        | Familia            | Peso     | Uso                                      |
|------------|--------------------|----------|------------------------------------------|
| Sans       | Geist Variable     | 400–600  | Todo: interfaz, títulos, cuerpo          |
| Monoespaciada | Geist Mono Variable | 400–500 | Código, identificadores, claves de API |

**Por qué Geist y no Inter.** El documento de partida pide Inter para la interfaz
e Instrument Serif para lo editorial. Riuna se queda en Geist por tres razones:
ya está en el *bundle*, ocupa el mismo registro geométrico neutro que Inter — la
diferencia no justifica el cambio — y, sobre todo, trae una monoespaciada de la
misma familia, que Inter no tiene y que Riuna necesita para bloques de código,
Mermaid y Shiki. **Instrument Serif se descarta**: no hay ninguna superficie
editorial en un producto interno sin landing.

Esta decisión se revisará solo si aparece una superficie editorial real.

### Escala

Riuna es una interfaz **densa a propósito**. El cuerpo son 14 px, no 16: en el
código actual, `text-sm` (14 px) y `text-xs` (12 px) suman 796 de 890 usos de
tamaño de texto. Eso no es un accidente heredado, es la escala correcta para un
tablero con cincuenta tarjetas.

| Rol                 | Tamaño | Peso | Interletrado | Uso                                        |
|---------------------|--------|------|--------------|--------------------------------------------|
| Display             | 30 px  | 600  | −0,02 em     | Acceso, onboarding. Único tamaño grande.   |
| Título de página    | 20 px  | 600  | −0,01 em     | Nombre de proyecto, cabecera de ajustes    |
| Título de sección   | 16 px  | 600  | −0,01 em     | Grupos dentro de una página, modales       |
| **Cuerpo**          | 14 px  | 400  | 0            | Interfaz, tarjetas, tablas, formularios    |
| Secundario          | 12 px  | 400  | 0            | Metadatos, fechas, contadores, ayudas      |
| Etiqueta            | 11 px  | 500  | +0,06 em     | Versalitas: encabezados de columna, chips  |
| Monoespaciada       | 13 px  | 400  | 0            | Código y claves                             |

Los titulares llevan `text-wrap: balance`. La prosa larga (descripción de tarea,
comentarios) se limita a unos 65 caracteres de medida.

---

## 06 · Sistema de producto

### Superficies que existen hoy

Esto es lo que hay, no lo que se planea. Cada superficie es un sitio donde la
marca se expresa.

| Superficie          | Qué es                                                        |
|---------------------|---------------------------------------------------------------|
| Tablero             | Kanban por columnas. La vista por defecto.                    |
| Lista               | Tareas en filas, agrupables.                                  |
| Backlog             | Lo que no está en curso todavía.                              |
| Calendario          | Tareas colocadas por fecha de vencimiento.                    |
| Gantt               | Barras en el tiempo. La precisión temporal del claim vive aquí.|
| Detalle de tarea    | Descripción rica, comentarios, actividad, tiempo, relaciones. |
| Búsqueda y paleta   | `⌘K`. La vía rápida para todo.                                |
| Ajustes             | Cuenta, proyecto, espacio de trabajo, roles, equipos.         |
| Proyecto público    | La única superficie que ve alguien de fuera.                  |

### Vocabulario de estado

Donde el documento de partida tenía nodos Inicio / Tarea / Decisión / Fin, Riuna
tiene columnas. Las cuatro por defecto, con su icono de Lucide:

| Columna       | Icono         | Significado                    |
|---------------|---------------|--------------------------------|
| Por hacer     | `Circle`      | Aceptada, sin empezar          |
| En curso      | `CircleDot`   | Alguien está en ello ahora     |
| En revisión   | `Search`      | Hecha, esperando validación    |
| Hecha         | `CheckCircle2`| Cerrada                        |
| *Planificada* | `CircleDashed`| Prevista, aún sin comprometer  |
| *Archivada*   | `Archive`     | Fuera de vista, no borrada     |

La progresión de iconos cuenta la historia sin leer la etiqueta: círculo vacío →
círculo con punto → lupa → visto. Cualquier columna nueva debe encajar en esa
progresión.

### Prioridades

Hoy: baja = azul, media = ámbar al 85 %, alta = ámbar, urgente = rojo. **Cuatro
prioridades y tres colores, dos de ellos el mismo tono a distinta opacidad.**
Media y alta son indistinguibles de un vistazo, que es exactamente cuando hace
falta distinguirlas.

Propuesta: baja = `mid` (`#4A6380`, neutro: no corre prisa) · media = info ·
alta = aviso · urgente = error.

### Principios de interfaz

1. **El contenido primero, el chrome callado.** La barra lateral y la cabecera
   van en `surface` con bordes de 1 px; el trabajo va sobre fondo blanco. Esto
   sustituye al «canvas-first» del documento de partida.
2. **El estado se codifica en forma, no solo en color.** Icono más color más
   texto. Nadie debe depender del tono para saber si una tarea es urgente.
3. **Densidad antes que aire.** Ver treinta tareas sin hacer scroll vale más que
   el respiro visual entre dos.
4. **El tiempo es una vista, no un módulo.** Calendario y Gantt son lentes sobre
   las mismas tareas, no secciones aparte con su propia lógica.
5. **Lo que es en tiempo real, lo parece.** Si algo cambia porque otra persona lo
   ha movido, se ve moverse.
6. **Nada se pierde en silencio.** Archivar, no borrar; y toda mutación deja
   actividad.

---

## 07 · Iconografía

Lucide (`lucide-react`), que ya cumple la especificación del documento de partida
sin tocar nada.

| Propiedad         | Valor                                  |
|-------------------|----------------------------------------|
| Estilo            | Geométrico, mínimo                     |
| Grosor de trazo   | 2 px sobre retícula de 24              |
| Terminaciones     | Redondeadas                            |
| Retícula          | 24 px                                  |
| Tamaño por defecto| **16 px** (`size-4`)                   |
| Tamaño reducido   | 12 px (`size-3`) y 14 px (`size-3.5`)  |
| Color             | `currentColor`, siempre                |

Iconos siempre de Lucide. Si hace falta uno que no existe, se dibuja con la misma
especificación —2 px, cabos redondos, retícula de 24— y se guarda en
`apps/web/src/components/icons/`. Nunca se mezclan dos familias de iconos en una
pantalla.

Los iconos no llevan color propio: heredan del texto. Las únicas excepciones son
los iconos de estado semántico y los de columna.

---

## 08 · Decisiones abiertas

Lo que este manual todavía no puede dar por cerrado.

| # | Decisión | Estado |
|---|----------|--------|
| 1 | **Mapeo de la paleta sobre los tokens de shadcn.** | **Cerrada:** opción B, teal literal en `--accent`, como pedía el documento de partida. Ver [ADR 007](adr/007-teal-en-los-estados-de-interaccion.md), que sustituye el mapeo de la [ADR 005](adr/005-sistema-de-marca.md). Aplicada en `apps/web/src/index.css`. |
| 2 | **Claim.** «Un solo cauce para todo el trabajo» es una propuesta. | Pendiente de aprobación. No aparece en la interfaz todavía. |
| 3 | **Dibujo del símbolo.** | **Cerrada** tras seis rondas de exploración. Anillo partido en diagonal con nodos inversos, ver [ADR 006](adr/006-simbolo.md). |
| 3b | **Variante ampliada.** Especificada en [03](#03--símbolo-y-logotipo), sin implementar. | Pendiente de que haga falta. No bloquea nada. |
| 4 | **Sustitución de los assets de Kaneo.** | **Cerrada.** Favicon, ICO, apple-touch-icon y PNG del manifest regenerados; `logo-light.svg` y `logo-dark.svg` eliminados —el lockup se compone en el cliente. Cierra la deuda de Fase 0. |
| 5 | **Revisión de tono de las 1.960 claves × 3 idiomas.** Las correcciones de [02](#02--personalidad-y-tono-de-voz) están identificadas, no aplicadas. | Trabajo aparte. |
| 6 | **Verde de éxito y etiqueta «Sage».** Ambos colisionaban con el teal. | **Aplicado:** éxito a `#16A34A`, «Sage» a `cyan-600`. |
| 7 | **Colores de prioridad.** Media y alta compartían tono. | **Aplicado** en `constants/priority-colors.ts`. |

Lo único que queda abierto de verdad es el claim (2), la revisión del símbolo (3)
y el repaso de tono (5). El sistema de color está cerrado y en uso.

---

## 09 · Gobernanza

### Lista de comprobación

Antes de dar por buena cualquier pantalla, componente o documento:

- [ ] ¿Refuerza *Claro · Fluido · Preciso*, o solo es bonito?
- [ ] ¿Los colores salen de tokens, no de hex escritos a mano? (Hoy no hay ni un
      hex literal en los componentes. Que siga así.)
- [ ] ¿El teal **sólido** solo aparece donde hay una acción, y solo una vez por
      pantalla? El tinte de interacción es otra cosa; ver la regla de oro.
- [ ] ¿Todo el texto llega a 4,5:1, y los componentes a 3:1, **en los dos temas**?
- [ ] ¿El estado se distingue sin depender del color?
- [ ] ¿La copia usa el vocabulario de [02](#02--personalidad-y-tono-de-voz), con
      claves estáticas de i18n y no cadenas incrustadas?
- [ ] ¿El tema oscuro se ha mirado de verdad, o se ha dado por hecho?
- [ ] ¿La pantalla reduce la complejidad percibida, o la traslada?

### Quién decide

Con un equipo de este tamaño, un solo responsable de marca aprueba cambios en las
secciones 01–07. Las secciones 04 y 05 son las que más cuesta revertir una vez
aplicadas: un cambio ahí se decide antes de escribirlo, no después.

### Cómo evoluciona este documento

Cada cambio estructural —una familia tipográfica nueva, un color de marca nuevo,
un cambio de claim— va acompañado de un ADR en `docs/adr/`. Este manual recoge el
resultado; el ADR guarda el porqué.

---

## Anexo · Trazabilidad con el documento de partida

### Se conserva sin cambios

- Los tres pilares (*Clear · Fluid · Precise*), reanclados al producto real.
- Los seis colores de la paleta, con sus hex exactos.
- El concepto del símbolo: dos nodos, arco navy arriba, arco teal abajo.
- La especificación de iconografía: geométrica, 2 px, cabos redondos, retícula 24.
- El fondo del tono de voz: claro, directo, técnico cuando toca.

### Se deriva porque el documento no lo cubría

- Paleta de tema oscuro completa.
- Escala de navy y teal para estados de interacción.
- Colores semánticos (éxito, aviso, error, info).
- Ratios de contraste, y la restricción que impone el teal.
- Familia monoespaciada.
- Escala tipográfica en píxeles.
- Vocabulario de producto en español.

### Se descarta

- **La sección 06 «Product System» entera** (nodos Inicio/Tarea/Decisión/Fin,
  lienzo colaborativo, «canvas-first»). Describe un producto que no existe.
- **Las secciones 09 y 10** (mensajes clave, *elevator pitch*, copia de hero,
  CTA «Start mapping», descripciones de funcionalidad). Son material de
  marketing para un producto público; Riuna es interno.
- **Inter e Instrument Serif**, por lo explicado en [05](#05--tipografía).
- **El claim en inglés** («Map the flow. Own the process.»). La interfaz es
  española ([ADR 003](adr/003-idioma.md)).
- La métrica de demostración («12 tasks · 8-week timeline · 4 team members»).

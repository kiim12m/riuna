# ADR 043 — La rejilla del panel: doce columnas y alto redimensionable

**Fecha:** 2026-09-28 · **Estado:** aceptada ·
**Estrecha la [ADR 030](030-paneles-personales-y-la-definicion-de-hecho.md)**

**Contexto.** La ADR 030 monto la rejilla con «dnd-kit y un ancho enumerado» de
una a tres columnas, y declino `react-grid-layout` porque «una rejilla libre de
arrastrar y redimensionar es una dependencia nueva para un grado de libertad que
el criterio de aceptacion no pide». El criterio cambio: una fila de cifras
—vencidas, hoy, esta semana— no cabe en tercios, y sin alto declarado una lista
de veinte filas y una tarjeta de un numero dejan la rejilla desalineada. Ademas
`span` no tenia ningun control en la interfaz: los unicos anchos que existian
eran los sembrados.

**Decisión.**

1. **Doce columnas y `row_span`.** `span` pasa de 1-3 a 1-12 y se le suma un
   `row_span` de 1 a 6 sobre una altura de fila fija, `--panel-row`, que es un
   token de densidad como los demas. Lo que no cabe hace scroll dentro de la
   tarjeta.
2. **Flujo compacto, no colocacion libre.** Sigue sin entrar
   `react-grid-layout`: lo que faltaba era una celda mas fina y un alto, no
   huecos. Y **sin `grid-auto-flow: dense`**, que rellena huecos tirando de
   elementos posteriores y desacopla el orden visual del `position` —el mismo
   que escribe el arrastre y el que ordena la exportacion—.
3. **El responsive se deriva, no se guarda.** Dos enteros en linea y tres media
   queries: fila entera —y alto que crece con el contenido— por debajo de 40rem,
   `spanForMedium` entre 40 y 64rem, `span` tal cual por encima. Nada de una
   distribucion guardada por tamaño de pantalla.
4. **`dueWindow` es un predicado por widget, no parte del ambito**, y las
   tarjetas de recuento que comparten ambito se resuelven en un solo barrido.

**Consecuencias.**

- **`grid-column: span var(--panel-w)` funciona; `span min(var(--panel-w), 12)`
  no**, en ningun motor: `var()` se sustituye antes de comprobar la gramatica,
  pero una funcion matematica no se admite donde la sintaxis pide un entero. Por
  eso el ancho intermedio viaja ya calculado como un segundo entero en vez de
  con un `matchMedia`, que ademas costaria un re-render del panel entero por
  cada tick de redimensionado de la ventana.
- **El tirador de esquina tiene que apagar el arrastre a mano.** Los `listeners`
  de dnd-kit son props sinteticas de React sobre la tarjeta entera, asi que el
  tirador corta `onMouseDown` y `onTouchStart`; no basta con confiar en el orden
  de los eventos de puntero. Y solo aparece a partir de `lg`: por debajo el
  ancho efectivo lo derivan las media queries y la aritmetica de celdas no
  cuadraria.
- **El tamaño tambien se elige en el dialogo, y eso no es un extra.** Es la
  unica via con teclado y la unica en movil. Ofrece 3, 4, 6, 8 y 12: doce
  opciones son ruido, y un ancho que no divide doce deja la fila desigual.
- **Se retira `{...attributes}` del envoltorio.** Ponia `role="button"
  tabIndex=0` alrededor del menu del widget —y ahora del tirador—, es decir
  botones dentro de un boton ARIA, y sin `KeyboardSensor` no aportaba nada.
- **Si `dueWindow` entrara en el ambito, el barrido compartido seria
  imposible.** Siete tarjetas con siete ventanas distintas dejarian de compartir
  base. Va en `widget-predicate.ts`, y la misma lista de predicados alimenta el
  `WHERE` de la ruta en serie y el `FILTER (WHERE …)` de la colapsada: es lo que
  garantiza que las dos den la misma cifra, y lo que comprueba la prueba de
  integracion.
- **Esta es la palanca que la ADR 030 dejo escrita y sin construir, y medir la
  justifica.** (2026-09-28, banco de 50.000 tareas, el usuario de medicion con
  5.062 asignadas.) El panel entero de once widgets sale a **148 ms p95 con la
  cache caliente y 264 ms en la primera pasada**, dentro del presupuesto de 300.
  **Las siete cifras solas, servidas una a una, ya cuestan 280-343 ms p95**: es
  decir, la ruta anterior se salia del presupuesto sin haber pintado todavia ni
  la semana ni la lista.

  El `EXPLAIN (ANALYZE, BUFFERS)` dice por que, y es la cifra que cierra el
  asunto: **cinco recuentos colapsados leen 3.038 buferes en 67 ms, y uno solo
  de ellos por separado lee 3.105 en 60 ms**. El barrido se comparte de verdad
  —los `FILTER` se evaluan por fila sobre las paginas que ya estaban leidas—,
  asi que cinco preguntas cuestan lo que costaba una. En serie serian cinco
  barridos completos de la misma tabla para cambiar solo el predicado.

  `MAX_WIDGETS_PER_DASHBOARD` sube de 12 a 24 por el mismo motivo: la
  distribucion de partida sola dejaba el panel a un widget del 422.
- **`doneRatio` se queda fuera del colapso**, porque necesita un denominador
  propio por widget y duplica la superficie por dos widgets heredados que la
  ruta en serie calcula igual de bien. Y cada filtro se compila en su propio
  `try`: un `FilterError` que hoy es el error *de un* widget se llevaria por
  delante a todo el grupo.
- **La ventana de `rangeDays` no puede vivir con la de vencimiento.** Se aplica
  sobre `task.completed_at` o sobre `time_entry.start_time` segun la metrica, y
  esa eleccion la hace `aggregate()`, que es quien sabe sobre que relacion esta
  consultando. Juntarlas habria puesto `completed_at` en la tarjeta de horas.
- **La guarda de `sumLogged` en `count` se mantiene.** La migracion 0060 la
  respaldo con datos hace tres semanas y su razon sigue valiendo: el grano de
  `time_entry` es la entrada, no la tarea. El total de horas sale de un widget
  `time` con `groupBy: "none"`, que es el reparto sin repartir.
- **Los paneles existentes se multiplican por cuatro y no se resiembran.**
  1→4, 2→8 y 3→12 reproducen la distribucion anterior al pixel, y la migracion
  0066 les da ademas un alto por tipo, porque el defecto de la columna es 1 y
  una lista de veinte filas en una fila de rejilla es un recorte. **La
  distribucion de partida nueva solo la ven los paneles sembrados a partir de
  ahora**: es una decision de producto, no un descuido, y quien ya tenga el suyo
  monta los widgets nuevos con los controles de tamaño que esto estrena.
- **Las dos formas de la ventana de vencimiento pasan a estar vigiladas, y al
  vigilarlas se vio que no coincidian.** `dueWindowCondition` sale de `my-work`
  a `utils/due-window.ts` —tercer consumidor—, y su `week` empezaba **hoy**
  mientras la rama `week` del `CASE` empieza **manana**, porque la de `today` va
  antes. Con eso, "Vencen esta semana" contaba otra vez las de hoy y discrepaba
  del reparto por `dueWindow` de la pantalla de al lado. La condicion pasa a
  calcar el `CASE`; `GET /api/my-work/tasks?due=week`, que siempre significo
  "los proximos siete dias contando hoy", conserva su contrato componiendo las
  dos ventanas en su punto de llamada, porque cambiar una superficie publica no
  es un efecto secundario de mudar una funcion.

  La prueba de unidad **no podia haberlo visto**: solo compara los parametros
  enlazados, y los dos los tienen iguales. Lo demuestra una de integracion con
  filas en cada ventana.
- **Y esa prueba destapo algo mas grande, que no se arregla aqui:** una tarea
  que vence hoy a las 00:00 se clasifica como **vencida**. `due_date` es un
  `timestamp` sin zona y viaja por el convenio UTC de drizzle, asi que en un
  servidor con desfase las horas pegadas a medianoche cruzan de dia al
  guardarse. No es del panel —`dueWindowExpression` la comparten "Hoy", el
  Planificador y "Mis tareas"— y es la deuda de zona horaria que
  `day-boundaries.ts` declara desde la Fase 4.5. Queda anotada en `plan.md` con
  su sintoma; elegir convenio es una decision de instalacion, no un parche en
  una consulta. Los fixtures de la prueba van a mediodia por eso.
- **Tres pruebas asumian los titulos sembrados** y se han reescrito. La de la
  paleta de datos se crea ahora su propio widget de reparto, porque la
  distribucion de partida ya no siembra ninguno.
- **La revision de codigo encontro cuatro cosas mas, todas de la misma
  familia: valores que se leian del sitio equivocado.** El widget de horas
  sumaba las de *cualquiera* sobre tareas asignadas a quien mira, porque el
  ambito personal acotaba la tarea y no la entrada de tiempo; ahora
  `aggregateLoggedTime` filtra tambien por `time_entry.user_id`, que es como
  `time-sheet/` define desde siempre "lo registrado por quien mira". La
  exportacion no pasaba `weekStartsOn`, asi que la hoja de la semana cubria
  siete dias distintos de los que se estaban viendo —justo lo que este modulo
  existe para impedir—. El tirador de teclado leia el tamano confirmado en vez
  del que se esta viendo, asi que dos pulsaciones seguidas mandaban el mismo
  valor. Y el editor mandaba siempre un 4x2 fijo, con lo que
  `DEFAULT_WIDGET_SIZE` no llegaba a aplicarse nunca a un widget creado desde
  la interfaz: la tabla vive ahora en `widget-size.ts`, sin un solo import,
  para que una prueba pueda comparar las dos copias como ya se hace con
  `buildFilter`.
- **Una vista previa que el servidor rechaza tiene que deshacerse.** `onResize`
  devuelve una promesa y la celda vuelve a su tamano si falla; antes la tarjeta
  se quedaba dibujada a una medida que nadie habia guardado hasta recargar.
- **La pasada por navegador encontro dos cosas que ninguna prueba veia.** La
  primera, `text-brand-foreground` en el rotulo del dia de hoy: es el color del
  texto que va *encima* de un relleno de marca, no el de un texto de marca sobre
  el fondo de la tarjeta. Daba verde oscuro sobre casi negro en tema oscuro y
  blanco sobre casi blanco en claro —contraste ~1:1, ilegible en los dos—, y no
  fallaba nada porque el elemento estaba ahi y tenia su texto. Con
  `text-foreground` y peso, 15,7:1 en oscuro y 16,9:1 en claro; el dia lo sigue
  marcando el borde y el tinte del contenedor, que es lo que pide el principio 2
  de `marca.md`.

  La segunda, que **por debajo de 40rem el alto fijo no aporta nada**: en una
  sola columna la rejilla ya no alinea nada con nada, y encajonar siete dias en
  184 px para hacer scroll dentro de una caja es peor que dejar crecer la
  tarjeta, que es lo barato en una pantalla donde sobra el alto y falta el
  ancho. Ahi la fila pasa a `minmax(var(--panel-row), auto)`.
- **El `Seq Scan` sobre `task` sigue siendo el coste dominante**, y no se
  corrige aqui. El ambito personal entra por `task_assignee` —que si usa su
  indice, 67 buferes— pero el `status <> 'archived'` obliga a recorrer las
  50.000 filas igualmente. Es el mismo barrido que la ADR 030 midio y acepto; lo
  que cambia es cuantas veces se paga. Un indice que lo evitara es una decision
  aparte, con su propia medicion.

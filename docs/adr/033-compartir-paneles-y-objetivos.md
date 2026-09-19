# ADR 033 — Compartir paneles y objetivos, y el cubo «otros»

**Fecha:** 2026-09-08 · **Estado:** aceptada

**Contexto.** Las rebanadas 1 y 3 dejaron dos limitaciones declaradas: un panel y
un OKR solo los veía quien los creaba. Un OKR privado no es un OKR. Y los
repartos cortaban en el cubo cincuenta **en silencio**, así que una tarta con
sesenta proyectos no sumaba el total y nadie sabía por qué.

**Decisión.** `is_shared` en `dashboard` y en `goal`, calcado de `view.is_shared`
(ADR 015): lo comparte quien lo crea, lo ve todo el espacio. Los repartos dejan
de cortar y suman la cola en un cubo `__other__`. Y `dashboard_widget.goal_id`
—columna, no clave en el JSONB, porque es una clave ajena— hace que un objetivo
se pueda mirar desde el panel.

**Consecuencias.**

- **Un objetivo compartido se mide contra su dueño, no contra quien mira.** Un
  resultado con ámbito «asignadas a mí» daría un número distinto a cada uno, y
  entonces el equipo no estaría mirando el mismo objetivo. **Es al revés que en
  un widget**, donde `scope` significa a propósito «el trabajo de quien mira»: un
  panel compartido en el que cada uno ve su parte es útil; un OKR así, no.
- **El administrador del espacio solo puede retirar lo compartido.** Copiar el
  criterio de las vistas al pie de la letra le habría dado también permiso sobre
  un panel **personal**, y la rebanada 1 prometió lo contrario. Lo cazó su propia
  prueba de límite. Añadir el compartir no puede convertir esa promesa en una
  excepción para todo lo demás.
- **La siembra mira si tienes panel propio, no si ves alguno.** Entrar en un
  espacio donde alguien ya comparte el suyo no puede dejarte sin el tuyo.
- **La cola se suma, no se tira.** Las categóricas dejan de llevar `LIMIT`: el
  `GROUP BY` devuelve una fila por clave distinta —proyectos, personas, equipos,
  columnas—, acotado por la configuración del espacio y no por el tamaño de la
  tabla, así que traerlas todas cuesta lo mismo y permite sumar. Queda una valla
  de 2.000 claves contra una cardinalidad que nadie haya previsto. **La tendencia
  es la excepción**: sus cubos son tramos consecutivos y «el resto de semanas» no
  significa nada, así que ahí sí se corta.
- **Un widget de objetivo no recalcula nada.** Lee el progreso que ya mide el
  módulo de objetivos, en una sola lectura para todo el panel. Duplicar el
  cálculo era pedir que divergieran.
- **Un objetivo compartido puede dejar de estarlo**, y entonces el widget de
  quien no es su dueño se queda sin nada que mirar: lleva su propio error, como
  cualquier otro widget roto.

**Lo que esta rebanada no trae, y por qué.**

- **La tabla embebida sigue sin paginar.** La [ADR 030](030-paneles-personales-y-la-definicion-de-hecho.md)
  argumentó que paginar dentro de una tarjeta de 300 px es una ficción y envió un
  top 20. Darle la vuelta ahora pide una razón que no ha aparecido.
- **`widget.view_id` no entra.** Su valor declarado era «que `view.config` y
  `widget.config` sean la misma forma por construcción», y **eso ya está hecho**:
  los dos usan `editableFilterSchema`. Lo que quedaba era la comodidad de elegir
  una vista guardada como fuente, y choca con que las vistas son por proyecto y
  de tipo `table`, mientras que casi todos los widgets cruzan proyectos.

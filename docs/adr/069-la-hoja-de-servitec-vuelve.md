# ADR 069 — La hoja de SERVITEC vuelve

**Fecha:** 2026-10-07 · **Estado:** aceptada

**Contexto.** La hoja de SERVITEC (ADR 012) solo se exportaba. El usuario pidió las dos
cosas (2026-10-05):
- **migrar el cuadro que se llevaba a mano**;
- **la ida y vuelta**: exportar, editar en Excel y volver a subir.

La hoja no tenía identificador de tarea, nombra el proyecto por su nombre y mete los
comentarios en una sola celda.

**Decisión.**

- **La exportación lleva el id de cada tarea en la columna J, oculta.** La G separa los
  datos de la nota de la H; la captura diaria no cambia.
- **Identidad.**
  - Una fila con id actualiza su tarea, y la tarea se queda en su proyecto diga lo que
    diga PROYECTO: **la hoja no mueve tareas de proyecto**.
  - Sin id, una huella de proyecto + concepto + día de alta en `external_ref` (origen
    `servitec`) reconoce lo ya importado de esa hoja. Dos filas iguales se distinguen por
    su orden.
- **Un PROYECTO que no existe se resuelve en el asistente**: crearlo, llevar sus filas a
  otro o descartarlas. Sin decidirlo, la importación es un 400 que los nombra.
  - Se buscan por nombre sin mayúsculas ni tildes. No cuentan los «Personal» ni los
    archivados.
  - Crear uno pide `project:create`, que el rol `member` ya tiene.
- **Estado a columna, el inverso de `resolveEstado`:**

  | Hoja | Columna |
  |---|---|
  | Pendiente | la primera |
  | En curso | la primera no final tras ella |
  | Realizado | la primera final |
  | .Realizado | archivada |

  Una tarea que ya está donde la hoja la escribiría se queda quieta: «En curso» cubre
  también «En revisión», y volver a subir la hoja no la devuelve.
- **El lector busca la fila de cabeceras por su nombre**, porque el cuadro histórico se
  hizo a mano.
  - «Fecha» y «FECHA» se distinguen por su orden.
  - La leyenda y los relevos «-» se saltan.
  - En «Comentario», una línea que empieza por `dd/mm/yyyy —` (o `-`, o `:`) abre un
    comentario y las demás siguen al de arriba.
- **Escribe con el núcleo del importador de Excel** (`importTasksInTransaction`), por
  proyecto y en una sola transacción para todo el libro.
  - Los cerrojos de árbol se toman en orden estable de id.
  - Es el segundo consumidor, y es lo que justificó separarlo.
  - Un proyecto nuevo se crea **antes**, porque el núcleo lee sus columnas con su propia
    conexión. Si la importación falla, se borra.
- **La fecha de alta es la de la hoja**, y solo en las altas.
- **Los comentarios entran con su día y sin avisos**, firmados «Hoja SERVITEC».
  - No se repite uno que la tarea ya tenga del mismo día con el mismo texto plano. Así
    no se duplican los que salieron de Riuna, ni los del cuadro subido dos veces.
- **Ensayo en seco** sobre el camino real. Las filas que irían a un proyecto por crear se
  cuentan aparte.
- **No dispara automatizaciones** (`origin: "import"`, ADR 067).

**Consecuencias.**

- La hoja sigue siendo una plantilla de un cliente en el código (ADR 012), ahora en dos
  sentidos.
- Cambiar PROYECTO en Excel no mueve una tarea: hay que moverla en Riuna.
- Borrar un comentario en Excel no lo borra en Riuna. Reimportar nunca borra (ADR 017).
- «FECHA», la de última actualización, se ignora al importar.

# ADR 009 — La agrupación por equipo vive en la lista y en el backlog, no en el tablero

**Fecha:** 2026-08-26 · **Estado:** aceptada

**Contexto.** La Fase 1 pedía «filtrado y agrupación por equipo en las vistas que ya hay». El filtrado entró sin discusión: es un predicado más sobre la lista de tareas. La agrupación no, porque **el tablero ya agrupa**: sus columnas son estados, de forma estructural, y arrastrar una tarjeta entre ellas es el gesto que cambia el estado. Meter una segunda dimensión de agrupación ahí no es añadir un menú, es decidir qué significa el tablero.

**Decisión.** «Agrupar por» cambia las secciones de la **vista Lista** —hoy una por columna, con equipo una por equipo— y reparte el **backlog** en bandas de equipo dentro de sus dos mitades, planificadas y archivadas. En el **tablero** el control aparece deshabilitado, con la razón escrita en el propio botón: el tablero ya agrupa por estado, en columnas.

Se descartaron las otras dos salidas:

- **Calles horizontales** (el kanban clásico: columnas de estado × bandas de equipo) es la respuesta correcta a largo plazo, pero obliga a reescribir el drag & drop para que arrastrar dentro de la banda cambie el estado y entre bandas cambie el equipo. Es una fase pequeña, no un remate de la Fase 1.
- **Que el equipo sustituya a las columnas** era barato en código y caro en producto: el tablero dejaría de contar el flujo de trabajo, que es lo único que un tablero cuenta.

**Consecuencias.**

- **Agrupando por equipo se apaga el arrastrar y soltar**, en la lista y en el backlog. Las secciones dejan de ser estados y no habría destino que escribir. Es el mismo precedente que ya existía al ordenar por algo que no sea la posición manual.
- **Cada fila enseña su estado** cuando la sección ya no lo dice: un distintivo con el icono y el nombre de la columna, delante de la fecha. Sin él, agrupar por equipo perdería la información que la vista Lista existe para dar.
- **Calendario y Gantt siguen sin agrupar ni filtrar.** No es un olvido: es la Fase 4, donde las cuatro vistas heredadas se conectan al mismo motor de filtros y agrupación en vez de cablear cada una por su cuenta.
- **La preferencia se recuerda por proyecto y en el navegador**, como el orden, con la misma clave para la lista y el backlog: es un «cómo quiero leer este proyecto», no un ajuste del proyecto. Cuando la Fase 4 traiga vistas guardadas y compartidas, esto se sustituye por `view.config`, no se amplía.
- **Solo salen los equipos con tareas.** Enseñar los equipos vacíos del espacio llenaría la lista de cabeceras que no llevan a ningún sitio. «Sin equipo» va al final, porque es un cajón de pendientes de repartir y no un departamento más.

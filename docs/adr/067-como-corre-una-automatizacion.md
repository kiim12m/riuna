# ADR 067 — Cómo corre una automatización

**Fecha:** 2026-10-05 · **Estado:** aceptada

**Contexto.** Una regla (ADR 066) reacciona a lo que pasa en el bus de eventos y actúa
llamando a los mismos controladores que la interfaz. Esos controladores publican sus
propios eventos, así que sin más una regla puede dispararse a sí misma o a otra en
círculo. Además alguien tiene que figurar como autor de lo que hace, y las importaciones
publican miles de altas de golpe.

**Decisión.**

- **El motor es un suscriptor más del bus** (`automation/engine.ts`), como la actividad y
  los avisos.
  - Por cada evento, una consulta busca las reglas activas del proyecto y las del
    espacio, y va por un índice parcial.
  - No hay caché: con varias réplicas se quedaría vieja.
  - Atiende el evento la instancia que lo publicó, así que cada regla corre una vez.
- **Qué no dispara:**
  - lo importado, que llega marcado con `origin: "import"`. Una importación de 5.000 filas
    no son 5.000 decisiones de nadie;
  - lo que arrastra una cascada (`cascadedFrom`): la regla responde a lo que alguien hizo,
    no a sus consecuencias;
  - los proyectos archivados;
  - en las reglas de espacio, los proyectos «Personal».
- **Orden de las comprobaciones:**
  1. el disparador (puro, `triggers.ts`);
  2. el bucle;
  3. el permiso de quien actúa;
  4. la condición, que es una búsqueda por clave primaria con el motor de filtros.

  Que no case el disparador o la condición no deja rastro; si no, cada evento llenaría
  el historial de cada regla.
- **Bucles.** Las acciones corren dentro de `eventContext.run` con la cadena de reglas
  que llevó hasta ellas. `publishEvent` la copia en cada evento. Una regla que ya está en
  la cadena, o una cadena de tres, no corre y queda anotada como `skipped: loop`.
- **Autor: quien guardó la regla por última vez**, como hacen las recurrentes con
  `createdBy`.
  - Antes de actuar se comprueba que sigue en el espacio con el permiso que la regla
    exige. Si no, la regla se **pausa sola** con su motivo, y guardarla o activarla otra
    vez la pone a nombre de quien lo hace.
  - La actividad lleva la marca de la regla, y la interfaz la nombra a ella.
  - Los avisos no se saltan a esa persona como si el cambio fuera suyo.
- **Las acciones van en orden y la primera que falla para las siguientes**: «mueve y
  avisa» no avisa de algo que no pasó.
  - Cada acción ve la tarea como la dejó la anterior.
  - Lo que ya está como la acción quiere se deja quieto: un evento de más es un disparo
    de más.
- **Salidas.**
  - El aviso usa `createNotification` con el tipo `automation`, que se entrega siempre y
    también por los canales de cada persona.
  - El webhook usa el cliente del webhook genérico: guarda anti-SSRF en cada envío,
    firma `X-Riuna-Signature` y sin redirecciones.
  - El chat de una regla de proyecto sale por la integración del proyecto, y el de una
    de espacio por su destino cifrado.

**Consecuencias.**

- Sin reintentos: un webhook caído queda como ejecución fallida en el historial.
- Sin tope por minuto: una regla mal hecha sobre un movimiento en bloque dispara una vez
  por tarea.
- Una regla de espacio no ve los eventos de proyectos «Personal», aunque esos proyectos
  no sean privados.
- `task.moved`, que no lleva `projectId`, no es todavía un disparador.

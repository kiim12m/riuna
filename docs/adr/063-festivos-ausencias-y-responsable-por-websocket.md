# ADR 063 — Festivos, ausencias y responsable llegan por WebSocket

**Fecha:** 2026-10-03 · **Estado:** aceptada · Cierra una deuda de la [ADR 060](060-ausencias-y-festivos.md)

**Contexto.** Un festivo, una ausencia o marcar a un responsable de departamento
cambian lo que ven otras personas —la capacidad de Hoy, del Planificador y del
Cronograma, el aviso «tu responsable ve tu plan», «Mi equipo»—, y ninguno de los
tres publicaba un evento. Los demás lo veían al enfocar la ventana o al volver
a entrar en la pantalla.

**Decisión.**

- **Un solo evento, `availability.changed`**, con `workspaceId` y los
  `userIds` a quienes les cambia algo, **resueltos al publicar**
  (`availability/changed.ts`). El suscriptor de `ws/index.ts` solo reparte un
  mensaje `AVAILABILITY_INVALIDATED` por el canal de usuario, sin consultar nada.
- **Quién lo recibe:**
  - un festivo, todo el espacio;
  - una ausencia, quien la tiene y quienes ven su plan (`leadIdsOf`, el punto
    único de visibilidad de la ADR 059), y nadie más;
  - marcar o desmarcar a un responsable, todo su equipo.
- **El cliente invalida por prefijo** (`user-ws-invalidations.ts`): festivos,
  ausencias, Planificador, Cronograma, Hoy y las claves de responsable.

**Consecuencias.**

- **El mensaje no lleva nada privado.** La nota de una ausencia no viaja, ni
  siquiera a quien la escribió: se vuelve a leer por la API.
- **Quien actúa también lo recibe** y refresca dos veces. Es inocuo, y excluirle
  exigiría pasar su identidad por el evento.
- **Un festivo en un espacio grande publica un mensaje por miembro.** Con decenas
  de personas es irrelevante; con miles habría que pasar a un canal de espacio.
- **Funciona con Redis y sin él:** `broadcastToUser` ya reparte entre instancias.

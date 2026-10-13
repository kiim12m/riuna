# ADR 081 — Avisos de proyecto y de espacio

**Fecha:** 2026-10-12 · **Estado:** aceptada

**Contexto.** Punto 1.6 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado):
un tablón de anuncios. Hasta ahora, «el jueves cortan la luz» iba por chat o en una tarea que
nadie tenía que hacer.

**Decisión.**

- **Una tabla `announcement`**: espacio, proyecto (nulo para un aviso del espacio), título,
  contenido en Markdown, autor, `pinned` con `pinned_until` opcional, y si avisó a los miembros.
  Se borra con su proyecto o su espacio. Un proyecto «Personal» no tiene avisos.
- **Permisos con el vocabulario que ya existe**, sin uno nuevo:

  | Acción | Permiso que exige |
  |---|---|
  | Leer | ver el proyecto o el espacio |
  | Publicar, editar o borrar en un proyecto | `project:update` |
  | Publicar, editar o borrar en el espacio | `workspace:manage_settings` |
- **Avisar a los miembros** se elige al publicar, y viene marcado. Manda `announcement_published`
  a todo el espacio menos al autor, porque todos ven todos los proyectos, por la campana y los
  canales. Editar no vuelve a avisar.
- **Fijar** saca el aviso como franja en las vistas del proyecto. La franja enseña el fijado
  vigente más reciente, del proyecto o del espacio. Ocultarla es cosa de cada navegador
  (`localStorage`); una edición la vuelve a sacar.
- **Dónde se ven**:
  - el tablón del proyecto, con el megáfono de su cabecera;
  - el del espacio, desde la paleta de comandos, la franja y el enlace del tablón del proyecto.
    No entra en la barra lateral, que se limpió a propósito (ADR 061).
- **Tiempo real**: cualquier cambio publica `announcement.changed`, que llega a todos los
  miembros del espacio por el canal de usuario y refresca tablones y franjas.
- **MCP**: `list_announcements` y `post_announcement`.

**Consecuencias.**

- Avisar a todo el espacio es una notificación por persona. Con el tamaño de esta instancia
  basta; con cientos de miembros habría que repartirlo en tandas.
- Un canal configurado solo para ciertos proyectos no lleva los avisos del espacio, como el resto
  de notificaciones sin proyecto. La campana sí los recibe.
- Los avisos no entran en la búsqueda global ni tienen comentarios.

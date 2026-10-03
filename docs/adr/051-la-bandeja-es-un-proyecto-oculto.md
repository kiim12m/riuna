# ADR 051 — La Bandeja es un proyecto por persona, oculto en las listas y no privado

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** Para capturar algo deprisa hace falta un sitio al que vaya sin
pensar en qué proyecto le toca. Riuna no lo tenía: toda tarea pide un proyecto,
y elegir uno es justo la decisión que se quiere aplazar. Al preguntar, el
usuario decidió que la Bandeja fuera un **proyecto por persona, oculto en las
listas pero no privado**.

**Decisión.**

- **`project.owner_user_id`**, clave ajena a `user` con `ON DELETE SET NULL`.
  Con valor, el proyecto es la Bandeja de esa persona.
- **Un índice único parcial** `(workspace_id, owner_user_id) WHERE
  owner_user_id IS NOT NULL` impone una sola Bandeja por persona y espacio.
- **Se crea al primer uso**, con `ensureInbox()` (`capture/inbox.ts`), detrás
  de `POST /capture/inbox`. Toma el mismo candado que ordena los proyectos del
  espacio y vuelve a mirar antes de insertar, así que dos capturas simultáneas
  devuelven la misma. `GET /capture/inbox` la lee sin crearla.
- **Nace como cualquier proyecto**, con las cuatro columnas por defecto, por
  `insertProject()`, que sale de `createProject`. Lleva el nombre de la
  persona, como «Bandeja de Ana», y la clave `BAN`: las claves nunca fueron
  únicas por espacio.
- **Se oculta en `get-projects.ts`**, que alimenta la barra lateral, los
  selectores, la administración y `list_projects` de MCP. También en los
  proyectos de la búsqueda y en la respuesta de reordenar. **No** se oculta en
  ninguna lectura de tareas ni en `GET /project/:id`.
- **El disparador `workspace_member_release_inbox`**, `AFTER DELETE` en
  `workspace_member`, la convierte en proyecto normal si la persona sale del
  espacio. Hay varios caminos de salida —quitar a un miembro, abandonar el
  espacio, borrar la cuenta—, la misma razón que la ADR 025.
- **En la interfaz**, la entrada «Bandeja» del espacio personal lleva a
  `/inbox`, que la crea si hace falta y abre sus tareas. La cabecera del
  proyecto explica, con un botón de información, que no es privada.

**Consecuencias.**

- **No hace falta pantalla propia.** La Bandeja usa el tablero, la lista, el
  detalle y «Mover a otro proyecto» como cualquier proyecto.
- **No se puede elegir como destino** en los selectores de proyecto: se entra
  por su puerta. La captura rápida (1.2) la usará por defecto.
- **Nada se pierde.** Si la persona se va o se borra, el proyecto aparece en
  las listas con su nombre y sus tareas, y quien la administre decide qué hacer
  con él.
- **Riesgo declarado:** que alguien la tome por privada. Lo explica el texto
  de la cabecera.
- **Verificado:**
  - 11 pruebas de integración: creación al primer uso, carrera de seis
    llamadas, una por persona y espacio, oculta en listas y búsqueda para todo
    el mundo, legible por otro miembro, permisos, salida del espacio, borrado
    de la persona y borrado del espacio. Las de ocultar y la de salir del
    espacio fallan sin el cambio;
  - una prueba de extremo a extremo desde la barra lateral.

**Actualización (2026-10-03): ahora se llama «Personal».** Al verla en una
copia de producción, al usuario no le convencía el nombre «Bandeja». Pidió
llevarla a «Proyectos» y llamarla «Proyecto personal» o «privado».

- **«Personal», no «privado»:** no lo es, por lo decidido arriba, y el
  nombre no puede prometer lo contrario.
- **Cada persona la ve fija en lo alto de su grupo «Proyectos»**, sin
  arrastre, en vez de en el espacio personal de la barra. La API la sigue
  dejando fuera de la lista de proyectos, y con ello de los selectores, la
  administración y MCP.
- **Se crea igual, al primer uso**, y su clave pasa de `BAN` a `PER`. La
  migración 0077 renombra las que ya existían con el nombre que les dio la
  API: «Bandeja de Ana» pasa a «Personal de Ana».
- **En el código sigue llamándose `inbox`.** Rutas, claves de traducción y
  funciones como `ensureInbox` no se renombran, para no tocar medio
  repositorio por un nombre visible.


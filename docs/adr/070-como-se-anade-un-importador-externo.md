# ADR 070 — Cómo se añade un importador externo

**Fecha:** 2026-10-07 · **Estado:** aceptada (receta, sin código)

**Contexto.** El plan pedía importadores de Trello, Jira, Asana y Notion. El usuario
decidió (2026-10-05) dejarlos **solo documentados**: «solo necesito Excel por ahora». Esta
ADR deja escrito qué piezas usar el día que haga falta uno, para no reinventarlas ni
saltarse las garantías que ya tienen.

**Decisión: un importador nuevo es un adaptador del lado del servidor** que traduce el
formato de origen a filas del formato de intercambio (ADR 017) y escribe con las piezas
de abajo.

- **No por la API pública**, como hacía el CLI de PLANKA (retirado en la ADR 097):
  - no puede fechar los comentarios;
  - cada alta y cada comentario dispara avisos e integraciones;
  - no llega a `external_ref`;
  - no tiene transacción.

  De ese CLI sí vale la estructura: un módulo de traducción puro con sus pruebas, un
  ensayo en seco, el fallo aislado por tablero y un informe.

**Las piezas**, todas en uso:

1. **`importTasksInTransaction(tx, input, project)`** (`task/controllers/import-tasks.ts`).
   - Escribe filas del formato de intercambio dentro de la transacción de quien llama.
   - Lleva cerrojo de árbol (ADR 016), jerarquía por esquema (`1.2.3`), épicas,
     etiquetas, campos, equipo, asignados múltiples e identidad por `ID` o `Referencia`.
   - La hoja de SERVITEC (ADR 069) es su segundo consumidor y sirve de ejemplo de
     adaptador: lector puro, plan, escritura por proyecto y remate.
2. **`external_ref`** (`resolveExternalRefs`, `upsertExternalRefs`). El `source` es el
   origen (`trello`, `jira`…) y el `external_id`, el id de allí: reimportar actualiza y
   nunca duplica.
   - Hoy solo admite `task`, `epic` y `field_definition` (una `CHECK`). Guardar otra
     entidad —un comentario, un adjunto, un tablero— exige una migración que la amplíe.
3. **Comentarios con su fecha y sin avisos.** `insertSheetComments`
   (`task/exports/servitec-comments.ts`) inserta en `activity`:
   - con `externalSource` y `externalUserName`;
   - sin repetir los de mismo día y texto.

   Con un id de origen por comentario, mejor deduplicar por `external_ref` que por texto.
4. **`origin: "import"`** en los eventos (`publishImportEvents`): lo importado no dispara
   automatizaciones (ADR 067), y los avisos llegan por tandas.
5. **Personas por correo.** El lector de Excel ya casa por correo y luego por nombre
   (`exchange/lookups.ts`). Quien no es miembro se queda fuera, con un aviso en el
   informe; no se crean cuentas.

**Lo que falta**, y habrá que construir:

- **Guardar en el servidor un fichero descargado.** Hoy los adjuntos solo entran por URL
  prefirmada de S3 desde el navegador, y la instancia de producción no tiene S3. Un
  importador con adjuntos necesita:
  - una escritura directa en el almacenamiento;
  - probablemente un almacenamiento en disco cuando no haya S3;
  - la guarda anti-SSRF (`assertPublicDestination`) para descargar.

**Notas por origen**, a fecha de hoy:

| Origen | Qué exporta | Jerarquía | Adjuntos |
|---|---|---|---|
| **Trello** | JSON por tablero: listas, tarjetas, checklists, etiquetas, miembros y acciones (comentarios) | Las checklists, como en PLANKA | Piden clave y token de su API para descargarse; sin ellos son enlaces que piden sesión |
| **Jira** | CSV o XML | Épica → historia → subtarea, que encaja en el árbol | Los sprints serían ciclos |
| **Asana** | CSV o JSON | Subtareas anidadas | Secciones como columnas |
| **Notion** | Zip con un CSV por base de datos | Depende de cómo se montó cada base | Las propiedades libres piden el paso de mapeo del asistente de Excel |

**Consecuencias.** Sin código no hay nada que mantener hasta que haga falta. El primer
importador real estrenará la escritura de ficheros y probablemente la ampliación de
`external_ref`. Ambas son decisiones suyas, no de esta ADR.

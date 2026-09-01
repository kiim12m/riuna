# ADR 017 — Formato de intercambio en CSV y Excel

**Estado:** aceptada · **Fecha:** 2026-09-01

## Contexto

La [Fase 5](../plan.md) pide importar y exportar en CSV y Excel con mapeo de
columnas, creación automática de campos personalizados e idempotencia vía
`external_ref`, preservando jerarquía y épicas **en los dos sentidos**.

Lo heredado de Kaneo no es un punto de partida para eso. El importador aceptaba
siete campos en JSON y, como Valibot no es estricto por defecto, **descartaba en
silencio las etiquetas que el propio export emitía**. Ninguno de los dos sabía
nada de jerarquía, épicas, campos personalizados, estimación, equipo ni
asignados múltiples. Toda tarea importada entraba como raíz. Y no había
idempotencia de ninguna clase: dos importaciones del mismo fichero creaban 2N
tareas.

Así que el formato no se generaliza: **se define**. Esta ADR es esa definición.

## Decisión

Una hoja plana, cabeceras en español, reconocidas sin distinguir mayúsculas ni
acentos y con alias en inglés. El mismo juego de columnas para `.csv` y `.xlsx`.

1. **La jerarquía viaja como numeración de esquema** (`1`, `1.1`, `1.1.2`), no
   como una columna «padre» ni como columnas por nivel. Se lee de un vistazo y
   las filas nuevas se enlazan entre sí sin necesitar identificadores.

   Sus dos filos —insertar obliga a renumerar, y un número mal escrito
   reparentaría en silencio— se acotan con reglas explícitas, no con un segundo
   mecanismo, que es lo que la regla nº 1 del fork prohíbe:

   - **R1.** El padre de una fila es la fila anterior más cercana cuyo esquema
     tenga **exactamente un segmento menos** y sea prefijo del suyo. Exigir «un
     segmento menos» y no «cualquier prefijo» es lo que impide que un `1.1.1.1`
     sin `1.1.1` delante se cuelgue de `1.1` promocionándose dos niveles.
   - **R2.** Un esquema repetido es un error, y el informe nombra las dos filas.
     Ninguna de las dos hace de madre: elegir sería elegir al azar.
   - **R3.** Si el padre implícito no está en el fichero, **no se mueve nada**:
     una fila con `ID` conserva el padre que tiene y una fila nueva entra como
     raíz, siempre con aviso.
   - **R4.** El export emite el esquema del **camino completo** —`1.1.1` aunque
     `1` y `1.1` no salgan como filas—, de modo que R3 pueda detectar que el
     fichero es parcial. Sin esto, reimportar una vista filtrada aplanaría el
     árbol.
   - **R5.** Si el fichero **no trae** la columna `Esquema`, la jerarquía no se
     toca en absoluto. Sin esta guarda, importar una hoja plana promovería a
     raíz el proyecto entero.

2. **La identidad tiene dos vías, y `ID` manda.** La columna `ID` la rellena el
   export, así que el viaje Riuna→Excel→Riuna es idempotente sin configurar
   nada. Si falta, se usa `Referencia` contra `external_ref` bajo un **nombre de
   origen** que se elige al importar y que por defecto es el del fichero
   (`xlsx:<nombre>`). El origen es estable frente al contenido a propósito: si
   dependiera de un hash, editar una celda rompería la idempotencia justo cuando
   más se necesita, que es al corregir y reimportar.

   Un `ID` que no existe, o que es de otro proyecto, **no casa**: la fila se
   trata como nueva. Escribir sobre una tarea ajena porque alguien pegó un
   identificador es peor que crear una de más.

3. **Reimportar nunca borra.** Una fila que desaparece del fichero no hace nada.
   Una fila que casa actualiza **solo las columnas que el fichero mapea**: una
   columna ausente no puede vaciar lo que ya hay escrito.

4. **La descripción viaja en dos columnas.** `Descripción` en texto plano, para
   leer, y `Descripción (HTML)` para el viaje de vuelta sin pérdida; si están
   las dos, gana la enriquecida. La segunda se **oculta** en la hoja de cálculo
   (`worksheet.getColumn(n).hidden = true`). **En CSV no hay columnas ocultas**
   y sale visible: se documenta en vez de disimularlo.

5. **Los tipos de los campos nuevos se infieren y se confirman.** Toda cabecera
   que no case con una columna reservada es un campo personalizado, con su clave
   derivada por `slugifyFieldKey`. El paso de análisis propone un tipo mirando
   los valores y el asistente lo enseña en un desplegable antes de importar. No
   se decide solo porque `type` y `key` son inmutables
   ([ADR 013](013-campos-personalizados.md)): un tipo mal elegido no se corrige,
   solo se archiva el campo y se crea otro. Por lo mismo la inferencia es
   conservadora —un código `00123` se queda en texto en vez de perder los ceros.

6. **El fichero se parsea en la API, no en el navegador**, y se sube **dos
   veces**: una para analizar y otra para importar. Lo primero es el punto 2 de
   la [ADR 012](012-exportacion-a-excel.md) literal —la autorización es de la
   API y `exceljs` ya vive solo ahí—. Lo segundo evita guardar el fichero en el
   servidor entre los dos pasos, que sería estado que caducar y que no sobrevive
   a una segunda instancia. El `File` vive en el navegador, así que quien
   importa lo elige una sola vez.

7. **Crear definiciones de campo exige `project:update`**, comprobado en el
   manejador y no en el middleware porque depende del cuerpo. Importar sin crear
   campos sigue al alcance de un `member` con `task:create`. Es la misma
   elección por fila que ya hace el módulo de campos.

8. **La plantilla de SERVITEC se absorbe, no se sustituye.** Su hoja no cambia;
   lo que pasa al motor es la conversión de fechas que descubrió —el número de
   serie de Excel sale de `getTime()` sin ajustar zona—, que ahora vive en
   `exchange/sheet-dates.ts` y usan las dos.

## Consecuencia

Exportar e importar dejan de perder información, y `external_ref` estrena los
escritores que la Fase 4.5 le dejó preparados: la Fase 8 reutiliza
`resolveExternalRefs` y `upsertExternalRefs` tal cual para Trello y Jira, sin
migrar nada.

`assertRequiredFieldsPresent` estrena consumidor: llevaba exportada y probada
desde la Fase 3 sin que la llamara nadie.

**Lo que se paga:**

- **La numeración es frágil por diseño.** Insertar una fila entre hermanas
  obliga a renumerar a mano lo que va debajo. Las cinco reglas evitan que eso
  corrompa el árbol, pero no evitan el trabajo. Si se vuelve un estorbo, la
  salida es una columna `Padre` **en lugar de** el esquema, nunca junto a él.
- **El viaje de ida y vuelta de la descripción depende de una columna oculta.**
  Quien edite el CSV a mano verá el HTML y podrá romperlo sin darse cuenta.
- **Multipart es superficie nueva.** Hasta ahora la única subida iba por URL
  prefirmada de S3. `bodyLimit` va **antes** que cualquier otro middleware:
  detrás del validador no protege de nada porque el cuerpo ya se ha leído
  entero, y `Xlsx.load()` carga el libro en memoria.
- **La hoja no se traduce.** La genera la API, que no tiene locale, así que las
  cabeceras están en español fijo, igual que ya hacía SERVITEC.
- **Reordenar hermanas al importar solo actúa sobre grupos completos.** Con
  `Esquema` mapeado, el orden de las filas ordena las hermanas —nuevas y
  existentes— dentro de cada grupo que el fichero trae entero. Un grupo al que
  le falta alguna hija se deja quieto y el informe lo cuenta
  (`siblingGroupsKept`): reordenar medio grupo entrelazaría el orden viejo con
  el nuevo, que es la misma prudencia que la regla 3. Y como `position` es la
  columna que comparten el árbol y el tablero ([ADR 011](011-arbol-de-tareas-y-epicas.md)),
  esto reordena también esa columna del tablero.

# ADR 034 — El informe del panel sale de la misma lectura que la pantalla

**Fecha:** 2026-09-08 · **Estado:** aceptada

**Contexto.** La Fase 7 pide «exportación de informes a Excel». La forma obvia es
un módulo de informes con sus propias consultas, y la trampa obvia es que esas
consultas se separen de las que pintan el panel: entonces la hoja y la pantalla
dicen números distintos y nadie sabe cuál creer.

**Decisión.** `GET /api/dashboard/:id/export` construye el libro a partir de
`getDashboardData` —**la misma lectura que pinta el panel**—, una hoja por
widget. Es el mismo criterio que la [ADR 015](015-vistas-guardadas.md) aplicó a
las tareas: exportar «la vista que estoy mirando» es pasarle la búsqueda que ya
vive en la URL, no reimplementar el filtrado.

**Consecuencias.**

- **La hoja no puede contradecir al panel**, porque no hay una segunda consulta
  que pueda divergir. Si un widget está mal, la hoja está mal igual — que es
  preferible a dos verdades.
- **Solo xlsx.** Un CSV es *una* tabla y un panel son varias: ofrecerlo obligaría
  a elegir un widget o a apilarlos con las columnas descuadradas. La exportación
  de tareas sí ofrece CSV, y ahí sí tiene sentido.
- **`buildExchangeWorkbook` se generaliza a varias hojas** en vez de copiarse. Ya
  tenía todo el cableado de ExcelJS —formato de fecha, texto explícito, cabecera
  congelada, autofiltro—, y una segunda copia habría divergido en el primer
  arreglo. La versión de una hoja se queda como envoltorio.
- **Un widget que falla deja su error en su hoja** en vez de desaparecer del
  libro sin decir nada. Mismo criterio que en pantalla.
- **La primera columna lleva la etiqueta resuelta, no el id.** Un informe con
  `cm3k9…` en la primera columna no lo lee nadie, y las etiquetas ya vienen
  resueltas en el mismo payload.
- **Nombres de hoja acotados y sin repetir:** Excel rechaza un libro con dos
  hojas iguales y no admite más de 31 caracteres, y dos widgets pueden llamarse
  igual sin que eso sea un error de quien los creó.

**Y un fallo de la rebanada 2 que esta rebanada destapó.** Al montar la ruta se
vio que `/:id/data` seguía pidiendo **propiedad**: un panel compartido lo
devolvía la lista y sus datos daban 403, así que se pintaba con todos los widgets
rotos. Compartir algo que no se puede leer no es compartirlo. La lectura pasa a
tener su propio gate —`requireDashboardVisible`— separado del de escritura.

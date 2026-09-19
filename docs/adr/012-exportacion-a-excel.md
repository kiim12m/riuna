# ADR 012 — Exportación a Excel del cuadro de tareas

**Estado:** aceptada · **Fecha:** 2026-08-27

## Contexto

El cuadro diario de tareas se mantiene a mano en un `.xlsx` del que cada día se
envía una captura al TEAMS. Riuna ya guarda esas tareas, pero su único export
—heredado de Kaneo— es un JSON por proyecto pensado para respaldo y
reimportación, no para leerlo. La [Fase 5](../plan.md) generalizará la
importación y exportación a CSV y Excel con mapeo de columnas, pero llega en la
semana 18 y el cuadro se sigue rellenando a mano hoy.

## Decisión

Una exportación **específica** del formato existente, ahora, antes de la Fase 5:
`GET /api/task/export/servitec/:workspaceId` devuelve el espacio de trabajo
entero como una hoja plana idéntica al original (cabeceras, fila-leyenda,
autofiltro, desplegable de estado y colores condicionales).

Tres decisiones dentro:

1. **`exceljs` como dependencia de la API.** Un `.xlsx` con validación de datos y
   formato condicional es un ZIP de XML de OOXML; escribirlo a mano son cientos
   de líneas de fontanería ZIP y CRC32. Es la única librería madura de Node que
   cubre las dos cosas. `apps/api` empaqueta con `--packages=external`, así que
   no engorda el bundle.
2. **En la API, no en el navegador.** La autorización es de la API
   (`requireWorkspacePermission({ task: ["read"] })`), y así el mismo camino
   queda disponible para MCP o para un envío programado, que es la continuación
   natural de un informe diario.
3. **Nombrada `servitec`, no `export genérico`.** El nombre dice que es una
   plantilla concreta. Cuando la Fase 5 traiga el motor de plantillas, esta será
   una de ellas en vez de la única.

## Consecuencia

El cuadro deja de mantenerse a mano. A cambio, una plantilla de un cliente vive
en el código —`apps/api/src/task/exports/servitec-workbook.ts`, que es el único
sitio que sabe cómo es la hoja— y hay una dependencia más que mantener. La Fase 5
tendrá que absorber este módulo como caso de prueba del motor genérico en vez de
tirarlo.

El árbol de la Fase 2 no cambia nada aquí: la hoja es plana y una subtarea sale
como una fila más, igual que el original, que tampoco tiene jerarquía. Las
épicas viven en su propia tabla y no añaden filas.

No hay importación desde este `.xlsx`: eso es Fase 5 y necesita `external_ref`
para ser idempotente.

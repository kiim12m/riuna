# ADR 015 — Vistas guardadas

**Estado:** aceptada · **Fecha:** 2026-08-28

## Contexto

El motor de filtros de la [ADR 014](014-motor-de-filtros.md) ya traduce un
árbol de condiciones a SQL, y la vista Tabla lo usa. Pero un filtro que hay
que reconstruir a mano cada mañana no es una herramienta: el plan pide
guardarlo y compartirlo.

## Decisión

Tabla `view` con `type` y `config jsonb`, y tres decisiones dentro.

1. **El `config` es JSONB.** Guarda el filtro, el modo de jerarquía, el orden
   y las columnas. Su forma la decide el motor de vistas y cambiará con él; una
   columna por ajuste sería una tabla ancha de nulos que hay que migrar cada
   vez que el motor aprende algo.

2. **Una vista es de quien la crea, no del rol.** Cualquiera del espacio puede
   guardarse una y compartirla; solo su dueño —o un administrador del espacio—
   la edita o la borra.

   Es deliberadamente lo contrario que `field_definition`
   ([ADR 013](013-campos-personalizados.md)), y por un motivo concreto: **un
   campo cambia la forma de las tareas de todo el mundo; una vista solo dice
   cómo mirarlas.** Atarla a `project:update` la habría dejado fuera del
   alcance de un `member`, que es exactamente lo que la Fase 3 descubrió y
   documentó como deuda. Aquí no se repite.

3. **El `config` es la búsqueda de la URL, literalmente.** Guardar una vista es
   serializar `?filter=…&treeMode=…`; cargarla es navegar. No hay estado
   paralelo que mantener en sincronía, y un enlace pegado en un mensaje y una
   vista guardada son la misma cosa escrita de dos maneras.

   Esto solo funciona porque el filtro vive en la URL, decisión que se tomó al
   descubrir que era la única forma de probarlo de punta a punta. Resultó ser
   la correcta por razones que no tenían nada que ver con las pruebas.

## Consecuencia

**Corrección de la Fase 4.5, sin cambiar la decisión de fondo.** Gobernar las
vistas por propiedad y no por el vocabulario de permisos tenía un efecto que
esta ADR no consideró: `requireWorkspacePermission` es **el único sitio donde
se comprueba el alcance de una clave de API**, así que salirse de él lo apagaba
de paso. Una clave emitida para un script de informes, con alcance
`task:["read"]`, podía crear, compartir y borrar vistas.

Se ha extraído `requireApiKeyScope`, que comprueba **solo** el alcance de la
clave sin mirar el rol, y se aplica a las tres escrituras. Una clave sin
alcance acotado pasa, y ninguna sesión de persona se ve afectada: el punto 2 de
esta decisión sigue en pie.

Una vista guardada solo cubre lo que el motor entiende hoy: filtro y modo de
jerarquía. El orden, las columnas visibles y la agrupación todavía no se
guardan porque todavía no se pueden configurar.

El tipo no cambia después de crear la vista: una vista de tabla con sus
columnas y su modo de jerarquía no significa nada en un calendario. Y por eso
mismo las vistas de `board`, `list`, `calendar` y `gantt` existen en el
vocabulario pero no las produce nadie: esas cuatro pantallas siguen filtrando
en el cliente, que es el grueso que le queda a la Fase 4.

Borrar la cuenta de alguien borra sus vistas, incluidas las compartidas. Una
vista sin dueño no la puede editar nadie, y conservarla solo dejaría basura
compartida que nadie reclama.

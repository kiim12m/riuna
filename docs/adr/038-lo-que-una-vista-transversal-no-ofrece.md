# ADR 038 — Lo que una vista transversal no puede ofrecer: ni columnas, ni árbol, ni campos de proyecto

**Fecha:** 2026-09-21 · **Estado:** aceptada

**Contexto.** Las vistas personales usan la misma barra de filtros que las de proyecto, sobre el registro del espacio en vez del de un proyecto. La tentación es ofrecer los mismos campos en los dos sitios: es la misma interfaz y el compilador de filtros siempre fue agnóstico del ámbito. Pero seis de esos campos **cambian de significado según el proyecto**, y ofrecerlos no da un error: da un número equivocado.

**Decisión.** `buildWorkspaceFieldRegistry` retira seis campos fijos y algunos personalizados, y pedirlos es un **400 con el nombre del campo**, no una lista vacía.

- **`status` y `column`** comparan contra los `column.slug` de **un** proyecto. `status eq "en-curso"` devuelve cero, sin avisar, en un proyecto cuya columna se llama `doing`. Su sustituto entre proyectos es `done`, que el disparador `task_completed_at` materializa con exactamente la misma regla.
- **`number` y `position`** se numeran por proyecto: compararlos entre proyectos no significa nada.
- **`parent` y `depth`** describen un árbol acotado al proyecto ([ADR 011](011-arbol-de-tareas-y-epicas.md)), así que **no hay modo jerarquía en una lista transversal**.
- **Los campos personalizados de proyecto no entran**, y **tampoco los del espacio que algún proyecto redefine con otra forma de comparación**. Este último es el caso peligroso: `get-field-definitions.ts` deja que la definición del proyecto eclipse a la del espacio, así que un `presupuesto` compilado como número leería un texto en el JSONB de ese proyecto, `jsonb_typeof` no casaría y **esas tareas desaparecerían del recuento en silencio**. Se comparan formas de comparación y no tipos: `currency` y `number` compilan ambos a `number`, así que redefinir uno como el otro no retira nada.
- **`epic`, `label` y `assignees` sí se quedan**: casan por id o por nombre, y los dos son estables en todo el espacio.

**Por qué no las alternativas.** Ofrecer `status` y que cada proyecto lo interprete a su manera produce un recuento que parece correcto y no lo es —el peor modo de fallo para una superficie que informa—. Unificar las columnas de todos los proyectos del espacio en un vocabulario común es un cambio de producto entero, no un ajuste de filtros: hoy cada proyecto configura las suyas a propósito. Y devolver una lista vacía en vez de un 400 esconde el error justo donde nadie va a buscarlo.

**Consecuencias.**

- **El tablero personal no puede tener carriles por estado.** Los suyos serán las ventanas de vencimiento (Vencidas, Hoy, Esta semana, Más adelante, Sin fecha), que ya calcula `dueWindowExpression`, y arrastrar entre carriles cambiará `due_date`, que es lo que el carril significa.
- **La lista personal es plana**, agrupable por proyecto o por ventana de vencimiento, sin modo jerarquía.
- **La tabla personal solo ofrece campos personalizados de espacio**, y un campo eclipsado con otro tipo desaparece de la barra de filtros sin explicación en la interfaz. La explicación está aquí y en el 400 del servidor.
- Un campo eclipsado **vuelve a ofrecerse solo** en cuanto el proyecto que lo redefinía lo alinea o lo borra: el registro se recalcula en cada lectura, no se cachea.

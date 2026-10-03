# ADR 036 — La barra lateral en tres espacios, y la administración vuelve al layout principal

**Fecha:** 2026-09-20 · **Estado:** aceptada

**Contexto.** La barra lateral tenía un solo grupo, «Vista general», con cuatro entradas de naturaleza distinta: el panel personal, los objetivos, la **tabla de gestión** de proyectos y los miembros. Las dos últimas no responden «qué me toca a mí» sino «cómo está montado este espacio», y solo le sirven a quien lo administra. Peor: el resto de la administración —general, roles, equipos, etiquetas, plan y los ajustes de cada proyecto— vivía en `/dashboard/settings`, una pantalla a pantalla completa, **sin barra lateral**, con pestañas propias y un botón «volver al espacio». Administrar el espacio significaba salir de la aplicación y volver.

**Decisión.** Tres grupos, y la administración deja de ser una pantalla aparte.

- **Espacio personal** (todo el mundo), **Administración** (solo con permiso) y **Proyectos** (la lista de siempre, sin cambios).
- Los ajustes de espacio y de proyecto se mudan a `/dashboard/workspace/$workspaceId/admin/…`, dentro del layout con barra lateral. `/dashboard/settings` **se queda solo con «Mi cuenta»** —perfil, avisos, preferencias y claves de API—, que es lo único que de verdad pertenece a quien ha iniciado sesión, y se sigue abriendo desde el menú de usuario.
- **La puerta del grupo son capacidades, no el rol.** Se enseña si hay alguna de `canManageWorkspace`, `canManageProjects`, `canManageTeam` o `canInviteUsers`, y cada entrada se filtra por la suya. `isAdmin` compara con las cadenas `owner` y `admin`, y el propio `use-workspace-permission` avisa de que un chequeo local de rol *"silently return false for any custom role that grants the permission"*: un rol a medida con permisos de sobra se habría quedado sin menú.
- **La raíz del espacio deja de ser la tabla de proyectos** y redirige al espacio personal, porque esa tabla se ha ido al grupo que no todo el mundo ve.

**Por qué no las alternativas.** Dejar la administración donde estaba y limitarse a enlazarla desde el grupo nuevo era el cambio pequeño, pero conservaba el salto a otro chrome: pulsar una entrada de la barra lateral y perder la barra lateral. Mover solo los ajustes de espacio y dejar los de proyecto en la pantalla vieja partía la administración en dos sitios otra vez, que es el problema de partida. Y gobernar el grupo con `isAdmin` era una línea menos y un rol a medida roto.

**Consecuencias.**

- **Trece ficheros de ruta cambian de sitio** sin que se toque el cuerpo de las páginas: el contenido viaja intacto a su nueva ruta. Los dos sub-layouts se envuelven en `WorkspaceLayout`, que antes les ponía la pantalla de Ajustes.
- **Desaparece el `beforeLoad` que elegía un espacio activo a mano.** Existía porque Ajustes vivía fuera de la ruta con parámetro y no tenía forma de saber *cuál*: dependía de la organización activa de la sesión y se quedaba en blanco al entrar por enlace directo. Ahora el espacio es el de la URL, y `useActiveWorkspace` ya lo prefiere sobre el de la sesión. Por lo mismo, los ajustes de proyecto leen `$projectId` del router en vez de sacarlo con una expresión regular del `pathname`.
- **Las URL viejas redirigen**, con la misma cortesía que se tuvo con `/my-work` y `/panel` en la [ADR 031](031-panel-personal-unificado.md): `/dashboard/settings/workspace/*`, `/dashboard/settings/projects/*` y `/…/$workspaceId/members`. Las dos primeras no llevan el espacio en la URL —ese era su defecto—, así que lo resuelven por la organización activa de la sesión. **La de espacio conserva la sub-página** (`…/settings/workspace/roles` llega a `…/admin/workspace/roles`), porque las cinco se siguen llamando igual; para eso la ruta padre tiene que ser un contenedor y no redirigir ella, o su `beforeLoad` se adelanta al del comodín y se come el sufijo. La de proyecto no la conserva: el identificador de un enlace guardado puede apuntar a un proyecto que ya no existe, y caer en el primero es mejor que caer en una pantalla vacía.
- **Una sección con sub-páginas apunta a la primera, y se marca por prefijo.** «Espacio» enlaza a `…/admin/workspace/general` para no encadenar una redirección en cada clic, pero su estado activo se calcula con el prefijo `…/admin/workspace`, así que sigue marcada en Roles, Equipos o Etiquetas. Aun así la sección tiene su propia redirección de índice: se llega a ella desde la redirección de la URL vieja y escribiéndola a mano, y sin ella el layout pinta su menú y un panel vacío.
- **Esconder una entrada no es una comprobación de autorización.** La autoridad sigue siendo la API, que ya exige `requireWorkspacePermission` en todas estas rutas; quien entre por enlace directo se topa con ella. El grupo oculto es comodidad, no seguridad.
- **El estado activo del menú pasa a `useRouterState`.** Se calculaba con `window.location.pathname`, que no es reactivo: no se repintaba al navegar dentro de la SPA salvo que algo más forzara el render.
- **El grupo personal nace corto —panel y objetivos—** y se llena en los bloques siguientes del interludio: Hoy, planificador, cronograma, vistas personales y parte de horas.

**Actualización (2026-10-03):** la administración salió de la barra lateral y
está en el menú del avatar, debajo de «Ajustes»
([ADR 061](061-la-administracion-en-el-menu-del-avatar.md)). Las puertas por
capacidad y las rutas `…/admin/…` siguen como aquí.

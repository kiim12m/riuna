# ADR 008 — Cuentas locales: usuario y contraseña, sin correo

**Fecha:** 2026-08-26 · **Estado:** aceptada

**Contexto.** Riuna es interno y autoalojado, y hasta ahora la única forma de dar de alta a alguien era invitarle por correo y que se registrase. Sin SMTP configurado eso ya funcionaba a medias —el enlace de invitación es el canal cuando no hay correo—, pero seguía exigiendo una dirección real por persona. Para equipos pequeños que no quieren repartir buzones, y para poder probar de verdad funciones como el filtrado por equipo, hace falta poder crear cuentas con **usuario y contraseña** y nada más.

**Decisión.** Cuentas locales como función de producto, no como script de desarrollo:

- **El correo sigue existiendo, pero es sintético.** `user.email` es `NOT NULL UNIQUE` en el núcleo de Better Auth y no se toca: a cada cuenta local se le genera `usuario@local.riuna`, un dominio reservado y configurable con `RIUNA_LOCAL_ACCOUNT_DOMAIN`. Nunca se le escribe.
- **Se entra con el nombre de usuario**, mediante el plugin `username` de Better Auth. El formulario de acceso tiene un solo campo que acepta las dos cosas y decide por la arroba, y por eso la arroba está prohibida en el patrón de usuario.
- **Solo el admin de instancia puede crearlas.** Crear una cuenta da acceso al servidor entero, no a un espacio de trabajo, así que la guarda es el rol de instancia —el que recibe el primer usuario al registrarse— y no el permiso de invitar del espacio.
- **El endpoint hace las dos cosas de una vez**: crea la cuenta y la añade como miembro del espacio. Una cuenta creada y suelta no le sirve a nadie.

**Por qué no las alternativas.** Un comando de desarrollo era más barato y quedaba fuera del producto, que es donde hace falta. Reutilizar la invitación con correos falsos deja al invitado teniendo que registrarse igual, y ensucia la lista de invitaciones. Quitar la restricción de correo en la tabla significa pelearse con el núcleo de Better Auth en cada actualización.

**Consecuencias.**

- **Una cuenta local no tiene correo al que escribir.** La entrega de notificaciones por correo se salta a quien tiene dirección en el dominio reservado; las notificaciones en la aplicación y por websocket le llegan igual. Restablecer contraseña, enlace mágico y OTP no le sirven: la contraseña la cambia el admin.
- **El dominio reservado viaja al cliente** en la configuración de instancia, porque la tabla de miembros necesita distinguir estas cuentas para no enseñar un correo que no existe. Es el único sitio donde se decide qué es una cuenta local.
- **Nombre de usuario único en toda la instancia**, no por espacio de trabajo. Dos personas pueden llamarse igual; sus usuarios no.
- **Una cuenta local puede dejar de serlo.** El admin le asigna una dirección real y con eso recupera las notificaciones y puede entrar con cualquiera de las dos llaves, porque el nombre de usuario se conserva. El correo se marca como verificado sin enviar nada: lo pone quien responde de la cuenta, y en una instancia sin SMTP no habría forma de verificarlo. El dominio reservado no se puede asignar a mano.

**Ampliación (26-08-2026): qué más puede hacer el admin.** Casi todo lo pedido ya lo servía el plugin `admin` —`update-user`, `set-user-password`, `ban-user` y `unban-user`, con las columnas `banned`, `ban_reason` y `ban_expires` heredadas del fork—, así que solo hubo que cablearlo y resolver el correo:

- **Actúa sobre cualquier miembro, no solo sobre cuentas locales.** Es lo que se espera de un admin de instancia; limitarlo a las locales dejaría sin poder bloquear a quien se registró por su cuenta.
- **El bloqueo es un interruptor**, sin motivo ni caducidad, aunque las columnas existan: cierra las sesiones abiertas e impide entrar, sin borrar nada. Si algún día hace falta dejar escrito el porqué, los campos están.
- **Todo en un solo formulario**: nombre, correo, contraseña nueva y bloqueo. La contraseña y el correo vacíos significan «no tocar», que evita cambiarlos sin querer al editar el nombre.
- **La tabla de miembros necesita datos que el plugin de organización no da** —quién está bloqueado—, así que el admin de instancia carga además la lista de usuarios del plugin de administración. Esa consulta está apagada para todos los demás, porque solo a él le responde.

**Nota (20-09-2026).** El [ADR 035](035-acceso-concedido-sin-aprobacion.md) cambió cómo se da acceso a un espacio, pero no movió esta frontera: quien administra un espacio concede acceso y, como mucho, permiso para registrarse; acuñar credenciales para otra persona sigue siendo cosa del admin de instancia.

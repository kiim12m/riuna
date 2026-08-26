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
- Queda sin resolver qué pasa si una cuenta local necesita después un correo real. Convertirla es un cambio de identificador y no está implementado.

# ADR 035 — El acceso al espacio lo concede el admin, sin aprobación de quien entra

**Fecha:** 2026-09-20 · **Estado:** aceptada

**Contexto.** Dar acceso a un espacio de trabajo exigía dos voluntades: el admin invitaba y la persona aceptaba desde un buzón propio. Ese segundo paso no decidía nada —quien ya había sido invitado acababa aceptando siempre— y costaba una pantalla, una entrada de navegación con contador, un sondeo cada minuto y dos páginas casi idénticas. Peor aún: quien se registraba **por el propio enlace de invitación** volvía a tropezar con el buzón antes de poder entrar, porque el panel le redirigía allí. La aprobación era un trámite, no un consentimiento.

**Decisión.** El acceso lo concede quien administra el espacio y es efectivo de inmediato. La invitación no desaparece, pero cambia de significado: pasa de máquina de estados de la pertenencia a **testigo de registro**.

- **Un endpoint, y la rama la decide el servidor.** `POST /workspace/:workspaceId/member` recibe un correo. Si ya tiene cuenta, entra como miembro en el acto; si no, se crea la invitación. La bifurcación no puede vivir en el cliente: preguntarle al navegador «¿este correo tiene cuenta?» le daría a cualquier admin de espacio un oráculo de enumeración de usuarios de toda la instancia.
- **No puede haber pertenencia antes que la cuenta**, porque `workspace_member.user_id` apunta a `user.id`. De ahí las dos ramas, y de ahí que la invitación siga existiendo: es también la llave que abre el alta con `DISABLE_REGISTRATION=true`.
- **La concesión se materializa sola al crearse la cuenta**, en el enganche de creación de usuario, buscando **por correo y no por el identificador de la invitación**: quien entra por enlace mágico o por OAuth nunca reenvía ese parámetro y su invitación se quedaría colgada.
- **La guarda es el permiso de invitar del espacio** (`invitation: ["create"]`), el mismo que gobernaba el flujo anterior, y **`owner` no se concede por aquí**: transferir la propiedad es otro flujo.
- **A quien se añade se le avisa** con una notificación en la aplicación. Se le mete sin pedirle permiso; que al menos se entere.

**Por qué no las alternativas.** Quitar la invitación del todo obligaba a que el admin de instancia creara cada cuenta, y con ella una contraseña ajena: justo la frontera que el [ADR 008](008-cuentas-locales.md) levantó a propósito. Dejar el buzón solo para quien ya tiene cuenta conservaba dos flujos para una misma cosa. Añadir una columna de estado a `workspace_member` habría convertido una pertenencia binaria —la fila existe o no— en una máquina de estados que nadie necesita.

**Consecuencias.**

- **Desaparecen el buzón de invitaciones, su entrada de navegación con contador y el endpoint `GET /invitation/pending`.** La página pública se conserva, porque es el destino post-registro de cinco sitios del código, pero ya no pregunta nada: con sesión y correo coincidente concede el acceso y entra.
- **La frontera del ADR 008 no se mueve.** Quien administra un espacio no crea cuentas: crea permiso para registrarse, que es exactamente lo que ya hacía al invitar. La persona sigue dándose de alta y eligiendo su contraseña.
- **En la tabla de miembros, una invitación pendiente ya no significa «falta que acepte» sino «falta que se dé de alta»**, y cancelarla es revocar un acceso ya concedido. El texto del correo cambia en consecuencia: el botón lleva a crear la cuenta, no a aceptar.
- **El límite de tasa de nube se pierde en esta ruta.** El de better-auth está atado a `/organization/invite-member` y no se dispara en una llamada interna. Quien llama ya es un admin autenticado del espacio, así que el riesgo baja mucho respecto al alta anónima que ese límite protegía, pero queda anotado: si Riuna se despliega en modo nube, hace falta un límite propio.

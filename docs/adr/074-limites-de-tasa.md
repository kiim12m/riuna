# ADR 074 — Límites de tasa, y de dónde sale la IP

**Fecha:** 2026-10-11 · **Estado:** aceptada

**Contexto.**

- **Better Auth solo limitaba en modo cloud** (`RIUNA_CLOUD`). En una instancia autoalojada,
  nada frenaba los intentos de contraseña.
- **El resto de la API no tenía límite**, salvo las claves de API (100 por minuto).
- **Y la IP era de quien llamaba.** Better Auth leía `cf-connecting-ip` y `X-Forwarded-For` sin
  mirar de dónde venía la conexión. Con los límites encendidos, inventarse esa cabecera habría
  dado un cupo nuevo en cada intento.
- Detrás del reenvío de puertos de Docker Desktop, todas las conexiones llegan desde la misma
  pasarela; por `tailscale serve`, el cliente solo aparece en `X-Forwarded-For`.

**Decisión.**

- **La IP se resuelve en un solo sitio** (`utils/client-ip.ts`):
  - `X-Forwarded-For` solo cuenta si la conexión viene de un proxy de confianza
    (`TRUSTED_PROXIES`, por defecto localhost y las redes privadas). Comprobarlo cuesta poco:
    `net.BlockList` es de Node.
  - Se recorre de derecha a izquierda saltando proxies, y la primera que no lo es, es el
    cliente. La de más a la izquierda la escribe quien llama.
  - Better Auth la recibe ya resuelta en `x-riuna-client-ip`, y solo lee esa cabecera. Si la
    trae quien llama, se borra.
- **Better Auth limita siempre**, no solo en cloud, por IP:
  - entrar con contraseña, con usuario o por OTP: 10 por minuto;
  - enlace mágico: 5 por minuto;
  - registrarse: 3 por minuto;
  - invitar: 5 por minuto;
  - *device flow*: 10 por minuto;
  - y sus reglas por defecto para recuperar la contraseña.
- **El resto de la API, en memoria y con ventana fija** (`utils/rate-limit.ts`):
  - lo autenticado cuenta **por persona o clave**, 600 por minuto
    (`RATE_LIMIT_USER_PER_MINUTE`): detrás de Docker todas las IP son iguales, y la persona no;
  - lo que se sirve sin sesión cuenta por IP, con un cupo por ruta. Son el `.ics` del calendario,
    el proyecto público, la invitación pública, el estado de la instancia y los receptores de
    webhooks de GitHub y Gitea;
  - los avatares y los adjuntos quedan fuera: un tablero carga decenas, el navegador los guarda y
    sus ids no se adivinan;
  - `/api/health` no tiene límite.
- **Un 429 lleva `Retry-After`**, que CORS expone igual que `X-Request-Id`.
  - En la web no se reintenta (`isClientError`) y sale un aviso traducido, uno por tanda.
  - Los formularios de acceso explican el 429 de Better Auth en español: el servidor lo manda en
    inglés.
- **`RATE_LIMIT_ENABLED=false` lo apaga todo.** Lo usan la integración, el humo y los
  simulacros, que se registran muchas veces por minuto desde la misma IP. `rate-limit.test.ts` lo
  enciende para sí.

**Consecuencias.**

- En memoria: con varias instancias, cada una cuenta lo suyo y el límite efectivo se multiplica
  por el número de instancias. Sirve para frenar abusos, no para medir; un Redis obligatorio
  para esto contradiría `AGENTS.md`.
- **En el PC no hay que configurar nada.** La pasarela de Docker es una red privada, y
  `tailscale serve` añade el cliente a `X-Forwarded-For`. Si la API recibiera conexiones directas
  de fuera, `X-Forwarded-For` se ignoraría.
- La regresión de seguridad tiene prueba: once intentos de contraseña, cada uno con una IP
  inventada en las tres cabeceras, y el undécimo es un 429. Con la lectura antigua, falla.

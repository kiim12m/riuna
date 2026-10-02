# ADR 055 — Avisos del navegador, sin service worker

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** Una tarea anclada a las 10:00 no avisaba de nada: había que
estar mirando Hoy. Al preguntar, el usuario decidió que los avisos fueran
**solo del navegador, con una pestaña abierta**: nada de push, PWA ni service
worker. Eso trae tres problemas:
- varias pestañas abiertas avisarían varias veces;
- en segundo plano los temporizadores se ralentizan;
- una notificación sin service worker no lleva botones.

**Decisión.**

- **`GET /today` da `startsAt`** para lo planificado hoy con hora: el instante
  de la hora anclada, calculado en la API con `setHours` sobre la medianoche
  de Madrid. Cuenta la hora de pared, así que el 25 de octubre las 10:00
  siguen siendo las 10:00. Ningún navegador lo calcula a su manera.
- **`dueReminders()`** (`lib/reminders/due-reminders.ts`), pura, decide qué
  toca avisar:
  - lo que ya llegó a su hora y no hace más de 15 minutos;
  - sin repetir: cada aviso lleva una clave;
  - y lo pospuesto, con su propia clave al acabar la posposición.
- **`useAnchorReminders`**, dentro de `WorkspaceRuntime`, comprueba cada 30
  segundos. Solo lee Hoy si los avisos están activados.
- **Una sola pestaña avisa** (`lib/browser-notify.ts`):
  - `navigator.locks` con `ifAvailable`, y dentro del cerrojo se vuelve a
    leer lo ya avisado;
  - las claves avisadas se guardan dos días en `localStorage`;
  - el `tag` de la notificación colapsa lo que se cuele;
  - no hace falta `BroadcastChannel`: `localStorage` ya lo comparten las
    pestañas.
- **Pulsar la notificación** trae la pestaña delante y abre un diálogo con
  tres opciones: «Empezar», «Posponer 10 min» y «Pasar al» siguiente día
  laborable, conservando la hora.
- **Se activa en Ajustes › Preferencias, por navegador.** El permiso lo da el
  navegador, no la cuenta. Si está bloqueado o no existe, el interruptor lo
  dice.

**Consecuencias.**

- **Límites declarados en la propia pantalla:**
  - sin una pestaña abierta no hay aviso;
  - en segundo plano puede llegar con un minuto de retraso;
  - posponer vale para ese navegador.
- **Un aviso que se perdió** porque no había ninguna pestaña abierta no se
  recupera pasados 15 minutos. Es lo que se busca: abrir Riuna a media tarde
  no debe soltar los avisos de la mañana.
- **El modo foco (3.2) y los avisos de ritmo (3.3)** usarán esta misma vía.
- **Verificado:**
  - 7 pruebas unitarias de `dueReminders`;
  - 3 de integración de `startsAt`, incluida la del cambio de hora;
  - 1 de extremo a extremo con `Notification` sustituida y el reloj
    adelantado: aviso, posponer y empezar.

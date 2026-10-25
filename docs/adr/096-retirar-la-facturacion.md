# ADR 096 — Se retira la facturación (Creem)

**Fecha:** 2026-10-25 · **Estado:** aceptada · **Decisión D3 de la
[auditoría de octubre](../auditoria-2026-10.md)**

**Contexto.** Kaneo vendía suscripciones de su nube con Creem: pasarela, webhook, pruebas de 14 días,
asientos por miembro y avisos de fin de prueba. Riuna es interno y no cobra a nadie. Todo estaba
apagado por configuración (`isBillingEnabled()` exige `RIUNA_CLOUD` y las claves de Creem), pero
seguía en cada ruta de tareas como `requireEntitlement` y en cada alta y baja de miembro.

**Decisión.** Se borra todo: `billing/` (~900 líneas), los trabajos `seat-reconciliation` y
`trial-reminders`, el middleware `requireEntitlement` y su uso en tareas, proyectos y captura, la
sincronización de asientos al añadir o quitar miembros y al borrar la cuenta, la excepción de
`/api/billing/webhook`, `billingEnabled` en los ajustes públicos, la plantilla del correo de fin de
prueba, la tarjeta de prueba, la página de facturación, la captura de `?checkout=` y la dependencia
`creem`. `isCloud()` **se queda**: sigue guardando el bloqueo de correos desechables y Turnstile,
que no son facturación.

**Consecuencias.**

- La migración `0097` borra `workspace_billing`, `billing_event`, `billing_reminder_sent` y
  `trial_grant` (esta última no estaba en el plan: solo la usaba la facturación), y las filas de
  `job_status` de los dos trabajos, para que no queden en el panel de la instancia como parados.
- Ya no hay `Plan`, asientos ni estado de suscripción en ningún sitio; si algún día se cobra, se
  parte de cero con su propia ADR.
- Los monitores de Sentry de los dos trabajos dejan de recibir señal; `sentry/alerts.json` ya no los
  lista.
- Las variables `CREEM_*`, `BILLING_*` y `BILLING_REMINDER_MAX_PER_RUN` salen de `.env.sample`.

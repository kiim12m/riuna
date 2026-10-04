# ADR 064 — Las preferencias de presentación viajan con la cuenta

**Fecha:** 2026-10-04 · **Estado:** aceptada

**Contexto.** La vista por defecto, la densidad, qué enseñan las tarjetas, si la
barra lateral arranca abierta y el primer día de la semana vivían solo en
`localStorage`. Cambiar de navegador o de dispositivo las perdía, y de ahí salía
que el calendario empezara en domingo para quien lo había puesto en lunes.

**Decisión.**

- **Una tabla `user_preference`**, una fila por persona con un `jsonb`
  (`GET`/`PUT /api/user-preferences`). No una columna por preferencia: se leen
  siempre enteras y nunca se filtran ni se ordenan por ellas (`AGENTS.md`). Las
  claves son una lista cerrada validada con Valibot; el resto se descarta, y el
  `PUT` **fusiona** en SQL, de modo que dos dispositivos que cambian preferencias
  distintas no se pisan.
- **El almacén local sigue siendo la memoria inmediata.** La interfaz no espera al
  servidor; `usePreferencesSync` lo sincroniza:
  - al abrir, aplica lo que trae el servidor **salvo las claves que la persona ha
    cambiado mientras tanto** (gana lo más reciente);
  - si el servidor no tiene nada, sube lo que este navegador ya había
    personalizado (lo que sigue en su valor por defecto no es una decisión);
  - cada cambio posterior se manda con 600 ms de espera, y si falla se conserva.
- **El tema no viaja**: es del dispositivo (portátil oscuro, móvil «sistema»). Los
  interruptores de avisos del navegador tampoco (ADR 055 y 056).

**Consecuencias.**

- **Una instalación existente no cambia nada** hasta que alguien guarda algo: sin
  fila, el servidor devuelve `{}` y el navegador sigue con lo suyo.
- **En un navegador compartido por dos cuentas**, lo que una personalizó y la
  otra no tiene guardado se queda en el almacén local; si el servidor de la
  segunda está vacío, se le subiría. Es el comportamiento de `localStorage` desde
  siempre, no uno nuevo.
- **Los valores por defecto están en dos sitios** (el almacén y
  `lib/preferences-sync.ts`); una prueba falla si se separan.

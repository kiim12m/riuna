# ADR 045 — La jornada personal es la única fuente de horario y capacidad

**Fecha:** 2026-09-29 · **Estado:** aceptada

**Contexto.** El Planificador (ADR 040) tenía una capacidad fija de 8 h por
persona, declarada como deuda. El Cronograma (ADR 041) tenía su propia
jornada fija de instancia, 08:00–18:00. Las dos eran constantes que ningún
usuario podía tocar, y encima discrepaban entre sí (8 h frente a 10 h). Con
el cronómetro ya en marcha (ADR 044), el momento de resolver las dos deudas a
la vez —con una sola fuente— había llegado.

**Decisión.**

- **Tabla nueva `user_work_schedule`**, aditiva y única por `user_id`
  (cascada), mismo patrón que `user_notification_preference`: hora de inicio
  y fin, comida opcional con sus propias horas, y una máscara de 7 bits
  `work_days` indexada como `Date#getDay()` (bit 0 domingo). Tres CHECK
  reproducen las reglas de `schedule_block` para las horas y añaden el rango
  de la máscara.
- **Sin fila, los valores por defecto de super-productivity**: 09:00–17:00,
  sin comida, lunes a viernes (8 h). Una instalación existente no cambia su
  carga del Planificador —seguía siendo 8 h—, pero el Cronograma sí cambia su
  horario visible, de 08:00–18:00 a 09:00–17:00: se declara como
  consecuencia, no como error.
- **`dayCapacitySeconds(schedule, día, bloquesCerrados)`**, función pura en
  `work-schedule/day-capacity.ts`: 0 si el día no es laborable; si lo es, la
  jornada menos la **unión** de la comida y los bloques `break` de ese día —
  nunca restados por separado, o un cierre que se solapa con la comida
  contaría el minuto compartido dos veces—. Amplía `calculateAvailableHours`
  de super-productivity, que sólo conocía la comida.
- **Un único horario alimenta tres pantallas.** `planner/controllers/get-plan.ts`
  cambia `capacitySeconds` (un número) por `capacityByDay` (uno por día de la
  ventana, ADR 040 revisada); `schedule/build-day.ts` y `get-schedule.ts`
  dejan de importar `WORK_START_MINUTE`/`WORK_END_MINUTE` de una constante de
  instancia y reciben el horario de quien mira. La comida entra en el
  Cronograma como un bloque `break` sintético construido en memoria —nunca
  una fila de `schedule_block`, así que nunca tiene bloque que editar—, y el
  cliente lo etiqueta «Comida»/«Lunch» al ver un tramo `break` sin bloque
  real detrás.
- **Un día no laborable reparte igual en el Cronograma**, desde el inicio de
  la jornada: lo que alguien planifica ahí se ha puesto a propósito. La
  máscara sólo apaga la capacidad del Planificador, no el reparto por horas.
- **`schedule/blocks-by-day.ts` nuevo**, extraído de `get-schedule.ts`: la
  carga y proyección de bloques sueltos y repetidos, para que el Planificador
  la reutilice al calcular `capacityByDay` sin repetir la consulta.
- **`dayKeysBetween` sube a `utils/day-boundaries.ts`**, compartida entre el
  Cronograma (que ya la tenía privada) y el Planificador.
- Ajustes de jornada en «Mi cuenta › Preferencias», guardados en la API y no
  en `localStorage` —la deuda que ya declaraba esa pantalla—.

**Por qué no las alternativas.** Restar la comida y los bloques cerrados por
separado, sumando sus minutos, habría sido más simple de escribir pero
contaría de más cualquier solape; el propio caso de prueba (comida
13:00–14:00 más un cierre 13:30–14:30) lo demuestra: la resta ingenua da 120
min, la unión real 90. Mantener `capacitySeconds` como un solo número y
promediar los días habría escondido que un día no laborable vale 0 y otro con
un bloque cerrado vale menos que un día limpio.

**Consecuencias.**

- `PUT /work-schedule` no valida el cruce de campos con Valibot —mismo
  convenio que `schedule_block`—: un rango invertido lo rechaza el CHECK de
  la base de datos como 500, no como 400 legible. El formulario ya desactiva
  «Guardar» antes de que eso pueda pasar de verdad; queda declarado, no
  resuelto.
- La capacidad por día vuelve `GET /planner` una consulta más: jornada,
  bloques del espacio, y las de siempre. Se comparte con el Cronograma en
  vez de duplicarla, que es lo que evita que cueste el doble.
- `lib/minutes.ts` y `lib/weekdays.ts` nuevos en el web, extraídos de
  `create-block-dialog.tsx`: los mismos `toMinutes`/`fromMinutes` y el mismo
  selector de día de la semana sirven ahora también a la jornada personal.

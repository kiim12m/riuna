# ADR 054 — Terminar el día, con la valoración en una tabla aparte

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** Lo que no se termina se queda en «De días anteriores» y crece
sin que nadie decida nada. El usuario pidió un ritual de cierre con dos
condiciones:
- el responsable de departamento verá el cierre, en solo lectura;
- la valoración del día (impacto, energía y nota) es **siempre privada**.

Un campo «privado» dentro de la misma fila depende de que cada consulta futura
se acuerde de no seleccionarlo.

**Decisión.**

- **Dos tablas.** `review` guarda lo que el responsable podrá ver:
  - el periodo, `day` o `week`, y su primer día;
  - los bloqueos;
  - un resumen en `jsonb`: hechas, registrado, movidas y sacadas del plan.

  Hay un cierre por persona, espacio y periodo. `review_private`, 1:1, guarda
  la valoración, con CHECK 1-4 y 1-3. **La separación es estructural**: para
  leer la valoración hay que unir otra tabla.
- **Una prueba de arquitectura** (`tests/api/review-privacy.test.ts`) falla si
  algún fichero de la API, fuera del esquema y del módulo `review/`, nombra
  `review_private`. El módulo del responsable (5.x) no podrá leerla sin que
  falle.
- **`PUT /review/day/:date`** cierra el día:
  - Exige una decisión por cada pendiente: lo planificado ese día y lo de días
    anteriores sin terminar, lo mismo que enseña Hoy. Cada decisión es otro
    día posterior o fuera del plan; si falta alguna, responde 400.
  - Aplica las decisiones con el plan en bloque (ADR 053).
  - Calcula las cifras con `getToday` en el mediodía de ese día, la misma
    composición que veía la persona.
  - Cerrar otra vez actualiza el cierre y acumula las movidas.
- **`GET /review/day/:date`** solo devuelve el cierre de quien mira, con su
  valoración. Por esa ruta no se puede pedir el de otra persona.
- **`GET /today` gana `dayClosed`.** Se calcula en `review/day-closed.ts`, que
  no importa la tabla privada.
- **El ritual** está en `rituals/close-day`, sobre `RitualShell`, un armazón
  de pasos que reutilizarán los demás rituales. Tiene cinco pasos:
  1. resumen;
  2. lo que queda, sin «Siguiente» mientras falte una decisión;
  3. qué te frena;
  4. tu día, con «Solo lo ves tú»;
  5. lo siguiente.

  Por defecto, «mañana» es el **siguiente día laborable** de la jornada
  personal (ADR 045). Se entra **solo con un botón** en la cabecera de Hoy,
  que dice «Día cerrado» si ya se hizo.

**Consecuencias.**

- **Nada se guarda hasta el último paso.** Salir no pregunta.
- **Decidir no es atómico con guardar.** Si el cierre fallara tras mover las
  pendientes, quedarían movidas y sin cierre; repetirlo lo arregla, porque ya
  no son pendientes.
- **Mientras no exista el módulo del responsable** (5.2), nadie más lee los
  cierres. El texto de «Qué te frena» ya lo avisa.
- **Verificado:**
  - 5 pruebas de integración: decisiones obligatorias, mover y sacar,
    repetir, rechazos, y aislamiento entre personas y espacios;
  - la prueba de arquitectura, que falla con un fichero de prueba que nombra
    la tabla;
  - una de extremo a extremo con el ritual completo.

# ADR 052 — Captura rápida: una línea, un parser propio y `POST /capture`

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** Crear una tarea pedía abrir un diálogo, elegir proyecto y
rellenar campos. Para apuntar algo al vuelo, eso es demasiado: lo que llega se
pierde, o se apunta fuera de Riuna. La Bandeja (ADR 051) da el sitio; faltaba
la forma de llegar a ella en un segundo.

**Decisión.**

- **Un parser propio, puro y sin dependencias** en
  `apps/web/src/lib/quick-add/parse.ts`. El vocabulario es cerrado y en
  castellano:
  - estimación: `1h`, `30m`, `1h30`, `1,5h`;
  - día del plan: `@hoy`, `@mañana`, `@pasado`, `@lun`…`@dom`, `@15/10`, con
    hora opcional detrás (`@mañana 10:00`). `@10:00` solo es hoy a esa hora;
  - vencimiento: `!vie`, `!15/10`;
  - etiqueta que ya existe: `#etiqueta`;
  - proyecto por su clave: `+CLAVE`;
  - prioridad: `*urgente`, `*alta`, `*media`, `*baja`;
  - `\` delante deja la palabra literal.

  Lo que no casa se queda en el título. Un día de la semana es el próximo, nunca
  hoy. Una fecha sin año es la próxima vez que llega.
- **Se descarta `chrono` y el lenguaje natural.** Con un vocabulario cerrado lo
  que se escribe es lo que se obtiene, y una vista previa con chips enseña qué
  se ha entendido antes de pulsar Intro.
- **`@` es el día del plan y `!` el vencimiento**, siempre por separado
  (ADR 040).
- **`POST /capture`** (`capture/controllers/capture-task.ts`) crea la tarea
  asignada a quien la captura. Va a la Bandeja salvo que se indique otro
  proyecto, y empieza en la primera columna sin terminar. Reutiliza
  `createTask`, `setPlanEntry` y `assignLabelToTask`. Todo se valida antes de
  crear nada: etiquetas solo del espacio y no copias, días `yyyy-mm-dd` y hora
  solo con día.
- **Dónde está la captura:**
  - la tecla `q` abre un diálogo desde cualquier pantalla, montado en
    `WorkspaceRuntime`;
  - la paleta;
  - una caja fija en Hoy, que planifica para hoy por defecto;
  - otra en «Sin planificar» del Planificador;
  - otra en la cabecera de la Bandeja propia.
- **MCP gana `capture_task` y `get_today`**, en los dos registros: 46
  herramientas.

**Consecuencias.**

- **La sintaxis está en castellano**, también para quien use la interfaz en
  inglés. La chuleta bajo la caja la recuerda.
- **La captura no es atómica**: crear, planificar y etiquetar son pasos
  separados. Por eso se valida todo antes. Un fallo entre pasos dejaría la
  tarea sin plan o sin etiqueta, nunca a medias.
- **En la paleta, la captura no lleva la `q` como atajo propio.** La paleta
  dispara los atajos de sus elementos mientras se escribe en ella, y la abriría
  cualquier búsqueda con una «q».
- **Verificado:**
  - 57 pruebas unitarias del parser;
  - 9 de integración, entre ellas que el día del plan no toca `due_date`;
  - 2 de extremo a extremo: desde Hoy, y con `q` desde otra pantalla.

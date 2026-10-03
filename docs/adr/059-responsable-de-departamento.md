# ADR 059 — Responsable de departamento, de solo lectura

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** El usuario decidió que el responsable de un departamento vea el
plan, la carga, los cierres y el stand-up de su gente, **solo para leer**, y
**nunca la valoración del día**. Ver datos de otra persona es justo donde
las ADR 041, 046 y 047 pagaron tres fugas entre espacios por repetir un
`WHERE` a mano. Los departamentos ya existen: son los equipos de Better
Auth.

**Decisión.**

- **`team_member.is_lead`**, booleano con `false` por defecto. Es columna, y
  no campo personalizado, porque se filtra. Better Auth no la conoce: al
  añadir a alguien a un equipo queda en `false`, y sacarle del equipo se la
  lleva.
- **Dos módulos:**
  - `team-lead/` marca o desmarca al responsable, con el mismo permiso que
    gestionar los miembros (`member:update`);
  - `lead/` es lo que lee el responsable, y **ningún endpoint suyo escribe**.
    Una prueba de arquitectura lo comprueba, y la de la ADR 054 ya impide
    que nombre `review_private`. Con clave de API, sus lecturas piden
    `task:read`, como las del Planificador.
- **Un único punto de visibilidad**, `lead/visibility.ts`: una sola consulta
  de pares (responsable, miembro) que sirve en los dos sentidos, a quién ve
  un responsable y quién ve a una persona. Exige a la vez:
  - el equipo es de este espacio;
  - el responsable lleva la marca;
  - las dos personas siguen siendo miembros del espacio;
  - y no son la misma.
- **Transparencia:** cada miembro con responsable lo ve en Hoy y en el
  Planificador: «Tu responsable, X, ve tu plan y tus cierres, no tu
  valoración».

**Consecuencias.**

- **Quien lleva varios equipos ve la unión de sus miembros**, y quien está
  en dos equipos con responsables distintos, los ve a los dos.
- **Sacar a alguien del equipo o del espacio corta la visibilidad al
  momento**: no hay copia de quién ve a quién.
- **La vista del responsable («Mi equipo», 5.3) carga en lote:** nueve
  consultas para el día del equipo entero y siete para su stand-up. Para
  eso, los bloques, las jornadas y los días no disponibles ganan versión de
  varias personas, y la de una sola delega en ella. Con 20 personas sobre
  50.000 tareas, p95 de 34 ms y 21 ms. Se relee cada minuto, sin tiempo
  real.
- **Verificado:**
  - pruebas de integración de la regla (otro equipo, otro espacio, fuera
    del espacio, sin marca, uno mismo), del permiso del interruptor, del
    aviso y de la vista: nada privado, y el stand-up idéntico al propio;
  - la prueba de arquitectura de solo lectura.

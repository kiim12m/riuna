# ADR 060 — Ausencias y festivos: días no disponibles

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** La capacidad de un día salía solo de la jornada personal
(ADR 045): un festivo o unas vacaciones contaban ocho horas libres, y el
Planificador invitaba a llenarlas. El responsable de departamento (5.2 y 5.3)
tendrá que ver quién está ausente. El usuario decidió que la ausencia **no
guarde el motivo**: una baja médica es un dato sensible.

**Decisión.**

- **`user_time_off`**: rangos de días (`starts_on`, `ends_on`, con CHECK
  `ends_on >= starts_on`) y una nota opcional que **solo ve su dueño**. **No
  hay columna de motivo.** Lleva `workspace_id`, como toda tabla nueva de
  Riuna. La gestiona la propia persona, en Ajustes › Preferencias, para el
  espacio activo, como el enlace del calendario (ADR 057). Como mucho un año
  por ausencia.
- **`workspace_holiday`**: un día con su nombre, único por espacio. Lo leen
  todos los miembros, porque se ve en su Planificador, y lo gestiona quien
  tiene `workspace:manage_settings`, en Administración › Festivos.
- **Los días van a la medianoche del servidor**, como `planned_date`
  (ADR 049), y se comparan por rango.
- **Una sola fuente**: `work-schedule/unavailable-days.ts::loadUnavailableDays`
  da, por día, si es festivo (con su nombre) o ausencia, **nunca la nota**.
  `capacityForDay` recibe ese dato y devuelve 0, igual que un día no
  laborable. Así lo ven a la vez el Planificador, el Cronograma y Hoy, que
  además pintan «Festivo · nombre» o «Ausente».
- **El aviso de «sin registrar»** (ADR 056) no suena un día no disponible.

**Consecuencias.**

- **Las recurrentes se siguen generando en festivo**, y nada impide planificar
  en un día no disponible: se ve en el día, con capacidad 0. «Pasar al
  siguiente día laborable» todavía no salta festivos ni ausencias.
- **Un festivo nuevo llega a los demás al volver a leer** (al enfocar la
  ventana o al entrar en la pantalla), no por WebSocket.
- **Una ausencia es de un espacio.** Con dos espacios, hay que darla en los
  dos.
- **Verificado:**
  - 5 pruebas de integración: capacidad 0 en las tres lecturas, sin que
    salga la nota; el rango y que cada ausencia es de su dueño; los permisos
    y el día repetido de los festivos; el aislamiento entre espacios, y un
    festivo dentro de una ausencia;
  - 2 pruebas de extremo a extremo, una por ajuste.

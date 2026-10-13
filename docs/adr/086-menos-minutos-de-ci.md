# ADR 086 — Menos minutos de CI

**Fecha:** 2026-10-13 · **Estado:** aceptada

**Contexto.** El 13 de octubre GitHub dejó de arrancar los trabajos: el repositorio, entonces
privado, había gastado unos 2.270 minutos de Actions en el mes, más que los incluidos.

| Workflow | Minutos |
|---|---|
| CI | 1.687 |
| Nightly | 265 |
| Simulacro | 203 |
| Dependabot | 116 |

Cada ejecución del CI suma unos 43 minutos de trabajos. La batería de extremo a extremo, que va
de una en una porque comparte instancia y base, se lleva 20, y con las PR apiladas de las tandas
se repetía en cada subida. El repositorio pasó a público ese mismo día, y con eso los minutos no
tienen tope. Aun así, las esperas y el ruido seguían.

**Decisión.**

- **La batería de extremo a extremo** corre en las PR contra `main` y en cada push a `main`, no
  en las PR apiladas sobre otra rama. También se puede lanzar a mano con «Run workflow».
- **El nightly y el simulacro sintético** ([ADR 072](072-copias-fuera-de-la-maquina-y-simulacro.md))
  se saltan las noches sin commits en `main` en las últimas 25 horas. Los lunes corren igual, por
  si cambiaron las imágenes base o lo que se descarga de fuera. A mano corren siempre, y el
  simulacro sigue corriendo en las PR que tocan copias, imágenes o migraciones.
- **Dependabot** pasa de semanal a mensual, porque cada PR suya pasa el CI entero. Las
  actualizaciones de seguridad no esperan al calendario.

**Consecuencias.**

- Una PR apilada se ahorra unos 20 minutos por subida. La batería de extremo a extremo corre
  siempre al fusionar en `main`, así que lo que llega a `main` sigue pasando por ella.
- Reapuntar una PR a `main` no relanza el CI, y «Re-run» repite el evento antiguo, que no la
  incluye. Para pasarla antes de fusionar hay que subir un commit, o cerrar y reabrir la PR.
- El simulacro sintético ya no es «cada noche», sino cada noche con cambios y todos los lunes.
  Con eso, `deploy/simulacro.sh` no pasa más de una semana sin ejecutarse.

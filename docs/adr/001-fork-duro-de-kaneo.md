# ADR 001 — Fork duro de Kaneo, sin sincronización con upstream

**Fecha:** 2026-08-23 · **Estado:** aceptada

**Contexto.** Riuna necesita un gestor de proyectos completo (auth, workspaces, tareas, cuatro vistas, comentarios, tiempo real, integraciones) que escribir desde cero costaría años-persona a 8 h/semana. Kaneo v2.22.0 lo tiene y es MIT.

**Decisión.** Partir de una copia de Kaneo con historia git propia, como programa independiente. No se mantiene remoto upstream ni se hacen merges.

**Consecuencias.**
- Tocar el esquema o el código heredado **no tiene coste futuro de conflictos**; se decide solo por el trabajo que implique.
- No llegan parches de seguridad de Kaneo: revisarlos manualmente es responsabilidad de Riuna.
- La licencia MIT obliga a una sola cosa: conservar el aviso de copyright, hecho en `LICENSE` y `NOTICE`. Riuna puede cerrarse y venderse.
- Se adoptan las convenciones de Kaneo en lugar de imponer otras: un fork con dos estilos envejece peor.

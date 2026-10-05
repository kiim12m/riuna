-- Cierre de la deuda de la ADR 030: el indice que se declaro y no se construyo.
-- Parcial, solo para las tareas cerradas, para las ventanas estrechas de
-- «hechas esta semana» sobre anos de historia. Medido con 50.000 tareas
-- repartidas en tres anos: de 20 ms a 0,5 ms.
--
-- Un CREATE INDEX normal bloquea las escrituras en `task` mientras se
-- construye: milisegundos con miles de tareas, y migrate() ya corre bajo
-- cerrojo consultivo y `lock_timeout`.
CREATE INDEX "task_completedAt_idx" ON "task" USING btree ("completed_at") WHERE completed_at IS NOT NULL;

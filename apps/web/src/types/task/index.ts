type TaskLabel = {
  id: string;
  name: string;
  color: string;
};

type TaskExternalLink = {
  id: string;
  taskId: string;
  integrationId: string;
  resourceType: string;
  externalId: string;
  url: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

type Task = {
  id: string;
  title: string;
  number: number | null;
  description: string | null;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  position: number | null;
  createdAt: string;
  updatedAt?: string;
  userId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage?: string | null;
  // Conjunto completo de asignados, en orden de asignacion e incluyendo al
  // responsable principal. Opcional porque solo lo devuelve el detalle.
  assignees?: { id: string; name: string; image: string | null }[];
  // Departamento responsable, independiente del asignado individual.
  // Opcional a proposito: es un campo aditivo y hacerlo obligatorio romperia
  // todos los sitios que ya construyen tareas sin el.
  teamId?: string | null;
  teamName?: string | null;
  projectId: string;
  columnId?: string | null;
  labels?: TaskLabel[];
  externalLinks?: TaskExternalLink[];
};

export default Task;

type Epic = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  color: string | null;
  position: number;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  archivedAt: string | null;
  taskCount: number;
  doneTaskCount: number;
};

export default Epic;

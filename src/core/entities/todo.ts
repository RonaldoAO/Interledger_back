export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export function createTodo(params: {
  id: string;
  title: string;
  completed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}): Todo {
  const now = new Date().toISOString();
  return {
    id: params.id,
    title: params.title,
    completed: !!params.completed,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  };
}


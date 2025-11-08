import { Todo } from "../entities/todo";

export interface TodoRepository {
  create(input: { title: string; completed?: boolean }): Promise<Todo>;
  list(): Promise<Todo[]>;
  getById(id: string): Promise<Todo | null>;
  update(
    id: string,
    data: Partial<Pick<Todo, "title" | "completed">>
  ): Promise<Todo | null>;
  delete(id: string): Promise<boolean>;
}


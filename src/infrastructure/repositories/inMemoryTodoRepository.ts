import { Todo } from "../../core/entities/todo";
import { TodoRepository } from "../../core/ports/TodoRepository";

export default class InMemoryTodoRepository implements TodoRepository {
  private items = new Map<string, Todo>();
  private seq = 1;

  private nextId(): string {
    return String(this.seq++);
  }

  async create({ title, completed = false }: { title: string; completed?: boolean; }): Promise<Todo> {
    const now = new Date().toISOString();
    const id = this.nextId();
    const todo: Todo = { id, title, completed: !!completed, createdAt: now, updatedAt: now };
    this.items.set(id, todo);
    return { ...todo };
  }

  async list(): Promise<Todo[]> {
    return Array.from(this.items.values()).map(t => ({ ...t }));
  }

  async getById(id: string): Promise<Todo | null> {
    const t = this.items.get(id);
    return t ? { ...t } : null;
    }

  async update(id: string, data: Partial<Pick<Todo, "title" | "completed">>): Promise<Todo | null> {
    const current = this.items.get(id);
    if (!current) return null;
    const updated: Todo = {
      ...current,
      ...(Object.prototype.hasOwnProperty.call(data, 'title') ? { title: data.title! } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'completed') ? { completed: !!data.completed } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.items.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}


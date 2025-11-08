import { Request, Response } from "express";

export interface TodoControllerDeps {
  createTodo: (input: { title: string; completed?: boolean }) => Promise<any>;
  listTodos: () => Promise<any[]>;
  getTodo: (id: string) => Promise<any | null>;
  updateTodo: (id: string, data: Partial<{ title: string; completed: boolean }>) => Promise<any | null>;
  deleteTodo: (id: string) => Promise<boolean>;
}

export default function createTodoController(deps: TodoControllerDeps) {
  return {
    list: async (_req: Request, res: Response) => {
      const items = await deps.listTodos();
      return res.status(200).json({ data: items });
    },

    get: async (req: Request, res: Response) => {
      const item = await deps.getTodo(req.params.id);
      if (!item) return res.status(404).json({ error: "Not Found" });
      return res.status(200).json({ data: item });
    },

    create: async (req: Request, res: Response) => {
      try {
        const created = await deps.createTodo({ title: req.body?.title, completed: req.body?.completed });
        return res.status(201).json({ data: created });
      } catch (e: any) {
        if (e?.code === "VALIDATION_ERROR") {
          return res.status(400).json({ error: e.message });
        }
        return res.status(400).json({ error: "JSON inválido" });
      }
    },

    update: async (req: Request, res: Response) => {
      try {
        const body = req.body ?? null;
        if (!body || (typeof body.title === "undefined" && typeof body.completed === "undefined")) {
          return res.status(400).json({ error: "Nada que actualizar" });
        }
        const updated = await deps.updateTodo(req.params.id, body);
        if (!updated) return res.status(404).json({ error: "Not Found" });
        return res.status(200).json({ data: updated });
      } catch (e: any) {
        if (e?.code === "VALIDATION_ERROR") {
          return res.status(400).json({ error: e.message });
        }
        return res.status(400).json({ error: "JSON inválido" });
      }
    },

    remove: async (req: Request, res: Response) => {
      const ok = await deps.deleteTodo(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not Found" });
      return res.sendStatus(204);
    },
  };
}


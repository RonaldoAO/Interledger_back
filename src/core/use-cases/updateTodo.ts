import { TodoRepository } from "../ports/TodoRepository";

export default (repo: TodoRepository) => async (
  id: string,
  data: Partial<{ title: string; completed: boolean }>
) => {
  const payload: Partial<{ title: string; completed: boolean }> = {};

  if (Object.prototype.hasOwnProperty.call(data, "title")) {
    if (typeof data.title !== "string" || !data.title.trim()) {
      const err = new Error("title inválido");
      // @ts-expect-error custom code
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    payload.title = data.title.trim();
  }

  if (Object.prototype.hasOwnProperty.call(data, "completed")) {
    payload.completed = !!data.completed;
  }

  return repo.update(id, payload);
};


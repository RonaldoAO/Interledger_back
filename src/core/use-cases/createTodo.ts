import { TodoRepository } from "../ports/TodoRepository";

export default (repo: TodoRepository) => async (
  input: { title: string; completed?: boolean }
) => {
  if (!input?.title || typeof input.title !== "string" || !input.title.trim()) {
    const err = new Error("title es requerido");
    // @ts-expect-error augment error with code
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return repo.create({ title: input.title.trim(), completed: !!input.completed });
};


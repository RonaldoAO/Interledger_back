import { TodoRepository } from "../ports/TodoRepository";

export default (repo: TodoRepository) => async (id: string) => {
  return repo.getById(id);
};


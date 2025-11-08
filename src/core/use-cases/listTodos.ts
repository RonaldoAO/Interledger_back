import { TodoRepository } from "../ports/TodoRepository";

export default (repo: TodoRepository) => async () => {
  return repo.list();
};


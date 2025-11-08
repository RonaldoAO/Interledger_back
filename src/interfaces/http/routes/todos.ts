import { Router } from "express";
import createTodoController, { TodoControllerDeps } from "../controllers/todoController";

export function todoRoutes(deps: TodoControllerDeps) {
  const controller = createTodoController(deps);
  const router = Router();

  router.get("/todos", controller.list);
  router.get("/todos/:id", controller.get);
  router.post("/todos", controller.create);
  router.put("/todos/:id", controller.update);
  router.delete("/todos/:id", controller.remove);

  return router;
}


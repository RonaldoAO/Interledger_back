import { Router } from "express";
import { healthRoutes } from "./health";
import { todoRoutes } from "./todos";
import { TodoControllerDeps } from "../controllers/todoController";

export function makeHttpRouter(deps: TodoControllerDeps) {
  const router = Router();

  router.use(healthRoutes());
  router.use(todoRoutes(deps));

  return router;
}


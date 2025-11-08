import express from "express";
import cors from "cors";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - resolveJsonModule enabled to import JSON
import apiSpec from "./docs/openapi.json";

import InMemoryTodoRepository from "./infrastructure/repositories/inMemoryTodoRepository";
import makeCreateTodo from "./core/use-cases/createTodo";
import makeListTodos from "./core/use-cases/listTodos";
import makeGetTodo from "./core/use-cases/getTodo";
import makeUpdateTodo from "./core/use-cases/updateTodo";
import makeDeleteTodo from "./core/use-cases/deleteTodo";

import { makeHttpRouter } from "./interfaces/http/routes";
import { errorHandler } from "./interfaces/http/middlewares/errorHandler";

const repo = new InMemoryTodoRepository();
const useCases = {
  createTodo: makeCreateTodo(repo),
  listTodos: makeListTodos(repo),
  getTodo: makeGetTodo(repo),
  updateTodo: makeUpdateTodo(repo),
  deleteTodo: makeDeleteTodo(repo),
};
export const app = express();

const LOG_FORMAT = process.env.LOG_FORMAT || "dev";
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(LOG_FORMAT));

// API Docs (Swagger UI)
app.use("/docs", swaggerUi.serve, swaggerUi.setup(apiSpec));
app.get("/docs-json", (_req, res) => res.json(apiSpec));

app.use(makeHttpRouter(useCases));

// Error handler (fallback)
app.use(errorHandler);

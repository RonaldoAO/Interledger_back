import { Router } from "express";
import { health } from "../controllers/healthController";

export function healthRoutes() {
  const router = Router();
  router.get("/health", health);
  return router;
}


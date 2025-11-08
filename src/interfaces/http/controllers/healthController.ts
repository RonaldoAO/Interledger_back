import { Request, Response } from "express";

export const health = (_req: Request, res: Response) => {
  return res.status(200).json({ status: "ok", uptime: process.uptime() });
};


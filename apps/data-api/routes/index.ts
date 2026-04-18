import express, { Request, Response, type Router } from "express";
import mongoose from "mongoose";
import { esClient } from "../lib/elasticsearch";

const router: Router = express.Router();

router.get("/health", async (req: Request, res: Response) => {
  const mongo = mongoose.connection.readyState === 1 ? "up" : "down";

  let es = "down";
  try {
    await esClient.ping();
    es = "up";
  } catch {
    // es stays "down"
  }

  const healthy = mongo === "up" && es === "up";
  res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded", mongo, es });
});

export default router;

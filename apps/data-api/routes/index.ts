import express, { Request, Response, type Router } from "express";

const router: Router = express.Router();

router.get("/", (req: Request, res: Response) => {
  res.send("Hello World");
});

export default router;

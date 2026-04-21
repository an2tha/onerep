import { Router, Request, Response } from "express";
const router: Router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok",
    endpoints: {
      foods: ["/api/foods", "/api/foods/search", "/api/foods/barcode/:code", "/api/foods/nutrients"],
      exercises: ["/api/exercises", "/api/exercises/search", "/api/exercises/id/:id", "/api/exercises/advanced", "/api/exercises/lookup"]
    }
  });
});

export default router;

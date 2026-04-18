import express, { Request, Response, type Router } from "express";
import { Foods } from "../lib/schemas/foods";
import { Exercises } from "../lib/schemas/exercises";

const router: Router = express.Router();

router.get("/foods/search", (req: Request, res: Response) => {
  const query = req.query.q as string;
  console.log(`[SEARCH] Food search initiated. Query: "${query}"`);

  (Foods as any).search(
    {
      multi_match: {
        query,
        fields: ["product_name.text", "brands", "categories", "ingredients_text.text"]
      }
    },
    (err: any, results: any) => {
      if (err) {
        console.error("[ERR] Elasticsearch Food search failed:", err);
        return res.status(500).json({ error: "Search failed", details: err });
      }
      console.log(`[SUCCESS] Food search returned ${results?.hits?.total?.value || 0} hits`);
      res.json(results.hits.hits);
    }
  );
});

router.get("/foods/nutrients", (req: Request, res: Response) => {
  const { grade, min_score, max_score } = req.query;
  console.log(`[SEARCH] Nutrient search: grade=${grade}, range=${min_score}-${max_score}`);
  
  const must: any[] = [];
  if (grade) must.push({ term: { nutriscore_grade: (grade as string).toLowerCase() } });
  if (min_score || max_score) {
    must.push({
      range: {
        nutriscore_score: {
          ...(min_score && { gte: Number(min_score) }),
          ...(max_score && { lte: Number(max_score) })
        }
      }
    });
  }

  (Foods as any).search({ bool: { must } }, (err: any, results: any) => {
    if (err) {
      console.error("[ERR] Nutrient search failed:", err);
      return res.status(500).json({ error: err });
    }
    console.log("[SUCCESS] Nutrient search complete");
    res.json(results.hits.hits.map((h: any) => h._source));
  });
});

router.get("/exercises/search", (req: Request, res: Response) => {
  const query = req.query.q as string;
  console.log(`[SEARCH] Exercise search initiated: "${query}"`);

  (Exercises as any).search(
    {
      multi_match: {
        query,
        fields: ["name", "primaryMuscles", "equipment"]
      }
    },
    (err: any, results: any) => {
      if (err) {
        console.error("[ERR] Exercise search failed:", err);
        return res.status(500).json({ error: err });
      }
      console.log(`[SUCCESS] Exercise search returned ${results?.hits?.total?.value || 0} hits`);
      res.json(results.hits.hits);
    }
  );
});

router.get("/exercises/advanced", (req: Request, res: Response) => {
  const { muscle, equipment, category, force } = req.query;
  console.log("[SEARCH] Advanced exercise search triggered");

  const must: any[] = [];
  if (muscle) must.push({ match: { primaryMuscles: muscle } });
  if (equipment) must.push({ term: { equipment: (equipment as string).toLowerCase() } });
  if (category) must.push({ term: { category: (category as string).toLowerCase() } });
  if (force) must.push({ term: { force: (force as string).toLowerCase() } });

  (Exercises as any).search({ bool: { must } }, (err: any, results: any) => {
    if (err) {
      console.error("[ERR] Advanced exercise search failed:", err);
      return res.status(500).json({ error: err });
    }
    res.json(results.hits.hits.map((h: any) => h._source));
  });
});

router.get("/foods/barcode/:code", async (req: Request, res: Response) => {
  try {
    const food = await Foods.findOne({ code: req.params.code });
    if (!food) return res.status(404).json({ message: "Product not found" });
    res.json(food);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

router.get("/foods/id/:id", async (req: Request, res: Response) => {
  try {
    const food = await Foods.findById(req.params.id);
    if (!food) return res.status(404).json({ message: "Product not found" });
    res.json(food);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

router.get("/exercises/id/:id", async (req: Request, res: Response) => {
  try {
    const exercise = await Exercises.findById(req.params.id);
    if (!exercise) return res.status(404).json({ message: "Exercise not found" });
    res.json(exercise);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

router.get("/foods", async (req: Request, res: Response) => {
  try {
    const foods = await Foods.find().limit(20);
    res.json(foods);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

router.get("/exercises", async (req: Request, res: Response) => {
  try {
    const exercises = await Exercises.find().limit(20);
    res.json(exercises);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

router.post("/foods", async (req: Request, res: Response) => {
  try {
    const food = new Foods(req.body);
    await food.save();
    res.status(201).json(food);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

router.post("/exercises", async (req: Request, res: Response) => {
  try {
    const exercise = new Exercises(req.body);
    await exercise.save();
    res.status(201).json(exercise);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

export default router;
import express, { Request, Response, type Router } from "express";
import { Foods } from "../lib/schemas/foods";
import { Exercises } from "../lib/schemas/exercises";
import { esClient } from "../lib/elasticsearch";
import {
  apiLimiter,
  searchLimiter,
  strictLimiter,
} from "../middleware/rateLimit";
import {
  foodSchema,
  exerciseSchema,
  searchQuerySchema,
  barcodeSchema,
} from "../lib/validation";

const router: Router = express.Router();

router.use("/foods/search", searchLimiter);
router.use("/foods/nutrients", searchLimiter);
router.use("/exercises/search", searchLimiter);
router.use("/exercises/advanced", searchLimiter);
router.post("/foods", apiLimiter);
router.post("/exercises", apiLimiter);

router.get("/foods/search", async (req: Request, res: Response) => {
  const validation = searchQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: validation.error.flatten(),
    });
  }

  const query = req.query.q as string;
  try {
    const result = await esClient.search({
      index: "foods",
      query: {
        multi_match: {
          query,
          fields: ["product_name", "brands", "categories", "ingredients_text"],
        },
      },
    });
    res.json(result.hits.hits);
  } catch (err) {
    console.error("[ERR] Food search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/foods/nutrients", async (req: Request, res: Response) => {
  const validation = searchQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: validation.error.flatten(),
    });
  }

  const { grade, min_score, max_score } = req.query;
  const must: any[] = [];
  if (grade) must.push({ term: { nutriscore_grade: (grade as string).toLowerCase() } });
  if (min_score || max_score) {
    must.push({
      range: {
        nutriscore_score: {
          ...(min_score && { gte: Number(min_score) }),
          ...(max_score && { lte: Number(max_score) }),
        },
      },
    });
  }

  try {
    const result = await esClient.search({
      index: "foods",
      query: { bool: { must } },
    });
    res.json(result.hits.hits.map((h: any) => h._source));
  } catch (err) {
    console.error("[ERR] Nutrient search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/exercises/search", async (req: Request, res: Response) => {
  const validation = searchQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: validation.error.flatten(),
    });
  }

  const query = req.query.q as string;
  try {
    const result = await esClient.search({
      index: "exercises",
      query: {
        multi_match: {
          query,
          fields: ["name", "primaryMuscles", "equipment"],
        },
      },
    });
    res.json(result.hits.hits);
  } catch (err) {
    console.error("[ERR] Exercise search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/exercises/advanced", async (req: Request, res: Response) => {
  const validation = searchQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: validation.error.flatten(),
    });
  }

  const { muscle, equipment, category, force } = req.query;
  const must: any[] = [];
  if (muscle) must.push({ match: { primaryMuscles: muscle } });
  if (equipment) must.push({ term: { equipment: (equipment as string).toLowerCase() } });
  if (category) must.push({ term: { category: (category as string).toLowerCase() } });
  if (force) must.push({ term: { force: (force as string).toLowerCase() } });

  try {
    const result = await esClient.search({
      index: "exercises",
      query: { bool: { must } },
    });
    res.json(result.hits.hits.map((h: any) => h._source));
  } catch (err) {
    console.error("[ERR] Advanced exercise search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get(
  "/foods/barcode/:code",
  strictLimiter,
  async (req: Request, res: Response) => {
    const validation = barcodeSchema.safeParse(req.params);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid barcode format" });
    }

    try {
      const food = await Foods.findOne({ code: req.params.code });
      if (!food) return res.status(404).json({ message: "Product not found" });
      res.json(food);
    } catch (err) {
      res.status(500).json({ error: err });
    }
  },
);

router.get(
  "/foods/id/:id",
  strictLimiter,
  async (req: Request, res: Response) => {
    try {
      const food = await Foods.findById(req.params.id);
      if (!food) return res.status(404).json({ message: "Product not found" });
      res.json(food);
    } catch (err) {
      res.status(500).json({ error: err });
    }
  },
);

router.get(
  "/exercises/id/:id",
  strictLimiter,
  async (req: Request, res: Response) => {
    try {
      const exercise = await Exercises.findById(req.params.id);
      if (!exercise) return res.status(404).json({ message: "Exercise not found" });
      res.json(exercise);
    } catch (err) {
      res.status(500).json({ error: err });
    }
  },
);

router.get("/foods", apiLimiter, async (req: Request, res: Response) => {
  try {
    const foods = await Foods.find().limit(20);
    res.json(foods);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

router.get("/exercises", apiLimiter, async (req: Request, res: Response) => {
  try {
    const exercises = await Exercises.find().limit(20);
    res.json(exercises);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

router.post("/foods", async (req: Request, res: Response) => {
  const validation = foodSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.flatten(),
    });
  }

  try {
    const food = new Foods(validation.data);
    await food.save();
    res.status(201).json(food);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

router.post("/exercises", async (req: Request, res: Response) => {
  const validation = exerciseSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.flatten(),
    });
  }

  try {
    const exercise = new Exercises(validation.data);
    await exercise.save();
    res.status(201).json(exercise);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

export default router;

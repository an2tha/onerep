import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  Clock,
  Flag,
  ForkKnife,
  GlobeHemisphereWest,
  Heart,
  MagnifyingGlass,
  Plus,
  SealCheck,
  ShareNetwork,
  SlidersHorizontal,
  Star,
  X,
} from "@phosphor-icons/react"
import type { Id } from "../../../../convex/_generated/dataModel"
import { api } from "../../../../convex/_generated/api"
import { NavigationBar, ToolbarButton } from "@repo/ui"
import { hapticSelection, hapticTap } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { COACH_RECIPE_PLACEHOLDER } from "@/lib/recipe-images"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import { currentDateKey, type Recipe } from "@/lib/food-log"
import { toast } from "@repo/ui"

export type StarterRecipe = {
  id: string
  name: string
  description: string
  category: "Breakfast" | "Lunch" | "Dinner" | "Snack" | "Dessert"
  time: number
  calories: number
  protein: number
  difficulty: "Easy" | "Medium"
  tags: string[]
  ingredients: string[]
  steps: string[]
  notes: string
  origin: string
  image: string
}

const IMAGE = {
  bowl: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=82",
  salad:
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=82",
  oats: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=900&q=82",
  pasta:
    "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=900&q=82",
  rice: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=82",
  table:
    "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=900&q=82",
} as const

const ORIGIN_BY_RECIPE: Record<string, string> = {
  "chicken-bowl": "United States",
  "lentil-skillet": "Greece",
  "berry-oats": "Switzerland",
  "salmon-greens": "France",
  "turkey-wrap": "United States",
  "tofu-rice": "Japan",
  "egg-toast": "United Kingdom",
  "pesto-pasta": "Italy",
  "yogurt-bowl": "Germany",
  "tuna-bean": "Italy",
  "chickpea-curry": "India",
  "protein-pancakes": "United States",
  "steak-couscous": "Morocco",
  "miso-noodles": "Japan",
  "cottage-bowl": "Poland",
  "shrimp-tacos": "Mexico",
  "quinoa-roast": "Peru",
  "chicken-soup": "Greece",
  "chia-pudding": "Mexico",
  "beef-rice": "South Korea",
  "hummus-box": "Lebanon",
  "protein-smoothie": "United States",
  "crispy-chickpeas": "Spain",
  "chocolate-yogurt": "France",
  "apple-oat": "United Kingdom",
  "falafel-bowl": "Egypt",
  "cod-tray": "Spain",
  "chicken-pasta": "Italy",
  "edamame-toast": "Japan",
  "date-bites": "Morocco",
}

const STARTER_RECIPE_BASE = [
  [
    "chicken-bowl",
    "Weeknight chicken bowl",
    "Roasted chicken, rice, cucumber, herbs, and lemon yogurt.",
    "Dinner",
    25,
    520,
    38,
    "Easy",
    ["high protein", "meal prep"],
    ["Chicken breast", "Rice", "Cucumber", "Greek yogurt"],
    IMAGE.bowl,
  ],
  [
    "lentil-skillet",
    "Herby lentil skillet",
    "Green lentils, tomatoes, spinach, lemon, and feta.",
    "Dinner",
    30,
    460,
    24,
    "Easy",
    ["vegetarian", "one pan"],
    ["Green lentils", "Tomatoes", "Spinach", "Feta"],
    IMAGE.table,
  ],
  [
    "berry-oats",
    "Overnight berry oats",
    "Creamy oats with Greek yogurt, berries, chia, and almonds.",
    "Breakfast",
    5,
    410,
    26,
    "Easy",
    ["no cook", "high fiber"],
    ["Oats", "Greek yogurt", "Berries", "Chia seeds"],
    IMAGE.oats,
  ],
  [
    "salmon-greens",
    "Salmon and greens",
    "Pan-seared salmon, potatoes, green beans, and mustard dressing.",
    "Dinner",
    35,
    610,
    42,
    "Medium",
    ["omega 3", "gluten free"],
    ["Salmon", "Potatoes", "Green beans", "Mustard"],
    IMAGE.salad,
  ],
  [
    "turkey-wrap",
    "Crunchy turkey wrap",
    "Turkey, avocado, cabbage, and lime yogurt in a soft wrap.",
    "Lunch",
    15,
    445,
    35,
    "Easy",
    ["quick", "portable"],
    ["Turkey", "Tortilla", "Avocado", "Cabbage"],
    IMAGE.table,
  ],
  [
    "tofu-rice",
    "Ginger tofu rice bowl",
    "Crisp tofu, edamame, rice, carrots, and sesame ginger sauce.",
    "Dinner",
    30,
    540,
    27,
    "Medium",
    ["vegan", "meal prep"],
    ["Tofu", "Rice", "Edamame", "Carrots"],
    IMAGE.rice,
  ],
  [
    "egg-toast",
    "Chilli egg toast",
    "Soft eggs, cottage cheese, chilli crisp, and herbs on sourdough.",
    "Breakfast",
    12,
    390,
    28,
    "Easy",
    ["high protein", "quick"],
    ["Eggs", "Cottage cheese", "Sourdough", "Chilli crisp"],
    IMAGE.table,
  ],
  [
    "pesto-pasta",
    "Pea pesto pasta",
    "Pasta tossed with peas, basil, parmesan, and lemon.",
    "Dinner",
    22,
    575,
    25,
    "Easy",
    ["vegetarian", "family"],
    ["Pasta", "Peas", "Basil", "Parmesan"],
    IMAGE.pasta,
  ],
  [
    "yogurt-bowl",
    "Apple crunch yogurt bowl",
    "Greek yogurt with apple, cinnamon, walnuts, and oat crunch.",
    "Breakfast",
    7,
    360,
    24,
    "Easy",
    ["no cook", "quick"],
    ["Greek yogurt", "Apple", "Walnuts", "Oats"],
    IMAGE.oats,
  ],
  [
    "tuna-bean",
    "Tuna and white bean salad",
    "Tuna, cannellini beans, tomatoes, parsley, and red wine vinaigrette.",
    "Lunch",
    12,
    430,
    39,
    "Easy",
    ["high protein", "no cook"],
    ["Tuna", "White beans", "Tomatoes", "Parsley"],
    IMAGE.salad,
  ],
  [
    "chickpea-curry",
    "Coconut chickpea curry",
    "A gentle tomato coconut curry with chickpeas and spinach.",
    "Dinner",
    28,
    510,
    19,
    "Easy",
    ["vegan", "one pot"],
    ["Chickpeas", "Coconut milk", "Tomatoes", "Spinach"],
    IMAGE.rice,
  ],
  [
    "protein-pancakes",
    "Banana protein pancakes",
    "Fluffy oat pancakes with banana, eggs, and vanilla yogurt.",
    "Breakfast",
    18,
    470,
    32,
    "Easy",
    ["high protein", "weekend"],
    ["Banana", "Eggs", "Oats", "Protein powder"],
    IMAGE.oats,
  ],
  [
    "steak-couscous",
    "Steak couscous plate",
    "Seared steak, herby couscous, tomatoes, and tahini.",
    "Dinner",
    32,
    650,
    46,
    "Medium",
    ["high protein", "balanced"],
    ["Steak", "Couscous", "Tomatoes", "Tahini"],
    IMAGE.bowl,
  ],
  [
    "miso-noodles",
    "Miso mushroom noodles",
    "Silky noodles with mushrooms, greens, miso, and sesame.",
    "Dinner",
    20,
    490,
    18,
    "Easy",
    ["vegetarian", "quick"],
    ["Noodles", "Mushrooms", "Miso", "Bok choy"],
    IMAGE.pasta,
  ],
  [
    "cottage-bowl",
    "Savory cottage cheese bowl",
    "Cottage cheese, eggs, cucumber, tomato, seeds, and black pepper.",
    "Lunch",
    10,
    395,
    36,
    "Easy",
    ["high protein", "no cook"],
    ["Cottage cheese", "Eggs", "Cucumber", "Tomato"],
    IMAGE.bowl,
  ],
  [
    "shrimp-tacos",
    "Lime shrimp tacos",
    "Spiced shrimp, cabbage, avocado, and lime crema.",
    "Dinner",
    24,
    505,
    34,
    "Medium",
    ["fresh", "family"],
    ["Shrimp", "Tortillas", "Cabbage", "Avocado"],
    IMAGE.table,
  ],
  [
    "quinoa-roast",
    "Roasted vegetable quinoa",
    "Quinoa with roasted vegetables, chickpeas, herbs, and feta.",
    "Lunch",
    35,
    480,
    22,
    "Easy",
    ["meal prep", "vegetarian"],
    ["Quinoa", "Chickpeas", "Zucchini", "Feta"],
    IMAGE.salad,
  ],
  [
    "chicken-soup",
    "Lemon chicken soup",
    "Chicken, rice, carrots, greens, and a bright lemon broth.",
    "Dinner",
    40,
    420,
    35,
    "Medium",
    ["comfort", "batch cook"],
    ["Chicken", "Rice", "Carrots", "Lemon"],
    IMAGE.table,
  ],
  [
    "chia-pudding",
    "Mango chia pudding",
    "Chia set in vanilla milk with mango and toasted coconut.",
    "Breakfast",
    8,
    340,
    13,
    "Easy",
    ["make ahead", "gluten free"],
    ["Chia seeds", "Milk", "Mango", "Coconut"],
    IMAGE.oats,
  ],
  [
    "beef-rice",
    "Korean-style beef rice",
    "Savory lean beef, rice, cucumber, carrots, and sesame.",
    "Dinner",
    25,
    590,
    41,
    "Easy",
    ["high protein", "meal prep"],
    ["Lean beef", "Rice", "Cucumber", "Carrots"],
    IMAGE.rice,
  ],
  [
    "hummus-box",
    "Hummus lunch box",
    "Hummus, eggs, vegetables, pita, olives, and fruit.",
    "Lunch",
    10,
    465,
    22,
    "Easy",
    ["portable", "no cook"],
    ["Hummus", "Eggs", "Pita", "Vegetables"],
    IMAGE.salad,
  ],
  [
    "protein-smoothie",
    "Berry protein smoothie",
    "Berries, banana, Greek yogurt, milk, and oats blended thick.",
    "Snack",
    5,
    330,
    29,
    "Easy",
    ["quick", "post workout"],
    ["Berries", "Banana", "Greek yogurt", "Oats"],
    IMAGE.bowl,
  ],
  [
    "crispy-chickpeas",
    "Smoky crispy chickpeas",
    "Oven-crisp chickpeas with smoked paprika and lemon.",
    "Snack",
    30,
    245,
    12,
    "Easy",
    ["vegan", "high fiber"],
    ["Chickpeas", "Olive oil", "Paprika", "Lemon"],
    IMAGE.table,
  ],
  [
    "chocolate-yogurt",
    "Chocolate yogurt pot",
    "Greek yogurt, cocoa, maple, berries, and hazelnuts.",
    "Dessert",
    8,
    285,
    21,
    "Easy",
    ["high protein", "no bake"],
    ["Greek yogurt", "Cocoa", "Berries", "Hazelnuts"],
    IMAGE.oats,
  ],
  [
    "apple-oat",
    "Warm apple oat crumble",
    "Cinnamon apples under a crisp oat and almond topping.",
    "Dessert",
    35,
    315,
    8,
    "Easy",
    ["fruit forward", "family"],
    ["Apples", "Oats", "Almonds", "Cinnamon"],
    IMAGE.oats,
  ],
  [
    "falafel-bowl",
    "Falafel salad bowl",
    "Falafel, chopped salad, pickles, hummus, and tahini.",
    "Lunch",
    25,
    535,
    20,
    "Easy",
    ["vegetarian", "fresh"],
    ["Falafel", "Hummus", "Tomatoes", "Tahini"],
    IMAGE.salad,
  ],
  [
    "cod-tray",
    "Mediterranean cod tray",
    "Baked cod, tomatoes, potatoes, olives, and herbs.",
    "Dinner",
    38,
    490,
    40,
    "Easy",
    ["one pan", "high protein"],
    ["Cod", "Potatoes", "Tomatoes", "Olives"],
    IMAGE.table,
  ],
  [
    "chicken-pasta",
    "Creamy chicken pasta",
    "Chicken and pasta in a light garlic parmesan spinach sauce.",
    "Dinner",
    30,
    620,
    44,
    "Medium",
    ["high protein", "family"],
    ["Chicken", "Pasta", "Spinach", "Parmesan"],
    IMAGE.pasta,
  ],
  [
    "edamame-toast",
    "Smashed edamame toast",
    "Lemony edamame, avocado, herbs, and seeds on toast.",
    "Lunch",
    14,
    405,
    21,
    "Easy",
    ["plant protein", "quick"],
    ["Edamame", "Avocado", "Sourdough", "Seeds"],
    IMAGE.table,
  ],
  [
    "date-bites",
    "Cocoa date energy bites",
    "Dates, oats, peanut butter, cocoa, and sea salt.",
    "Snack",
    15,
    190,
    6,
    "Easy",
    ["make ahead", "no bake"],
    ["Dates", "Oats", "Peanut butter", "Cocoa"],
    IMAGE.bowl,
  ],
].map(
  ([
    id,
    name,
    description,
    category,
    time,
    calories,
    protein,
    difficulty,
    tags,
    ingredients,
    image,
  ]) => ({
    id,
    name,
    description,
    category,
    time,
    calories,
    protein,
    difficulty,
    tags,
    ingredients,
    image,
  })
) as Omit<StarterRecipe, "steps" | "notes">[]

function quantityFor(name: string) {
  if (/chicken|turkey|salmon|steak|beef|cod|shrimp|tuna|tofu/i.test(name))
    return "180 g"
  if (/egg/i.test(name)) return "2"
  if (/rice|pasta|noodles|oats|quinoa|couscous/i.test(name)) return "75 g"
  if (/yogurt|cottage cheese/i.test(name)) return "170 g"
  if (/oil|mustard|miso|tahini|chilli crisp|cocoa/i.test(name)) return "1 tbsp"
  if (/seeds|chia|walnuts|almonds|hazelnuts|parmesan|feta/i.test(name))
    return "20 g"
  if (/tortilla|pita|sourdough/i.test(name)) return "1 serving"
  return "100 g"
}

function detailedMethod(recipe: Omit<StarterRecipe, "steps" | "notes">) {
  const ingredients = recipe.ingredients
  const first = ingredients[0]
  const rest = ingredients.slice(1).join(", ")
  if (/smoothie/i.test(recipe.name)) {
    return [
      `Measure the ${ingredients.join(", ")}. Use frozen fruit for a thicker smoothie.`,
      "Add the liquid ingredients to a blender first, followed by the remaining ingredients.",
      "Blend on high for 45–60 seconds. Stop once to scrape down the sides if needed.",
      "Add cold water a tablespoon at a time to adjust the texture, then serve immediately.",
    ]
  }
  if (/overnight|chia pudding/i.test(recipe.name)) {
    return [
      `Measure the ${ingredients.join(", ")} into a jar or lidded container.`,
      "Stir thoroughly for 30 seconds, rest for 5 minutes, then stir again to break up any clumps.",
      "Cover and refrigerate for at least 4 hours, ideally overnight.",
      "Stir before serving and loosen with a splash of milk if the mixture is too thick.",
    ]
  }
  if (recipe.tags.includes("no cook") || recipe.tags.includes("no bake")) {
    return [
      `Measure the ${ingredients.join(", ")} and prepare a bowl or airtight container.`,
      `Cut any fruit or vegetables into bite-size pieces. Combine the ${first} with ${rest} and fold gently until evenly mixed.`,
      "Taste and adjust with a small pinch of salt or your preferred sweetener, depending on the dish.",
      recipe.category === "Breakfast"
        ? "Cover and chill for at least 20 minutes, or overnight for a softer texture."
        : "Serve immediately, or refrigerate in a sealed container until needed.",
    ]
  }
  if (/pancake/i.test(recipe.name)) {
    return [
      "Blend the banana, eggs, oats, and protein powder into a thick, pourable batter. Rest for 5 minutes.",
      "Warm a non-stick pan over medium-low heat and lightly grease it.",
      "Cook small pancakes for 2–3 minutes, until bubbles form, then flip and cook for another minute.",
      "Serve warm with yogurt or fruit. Add a splash of milk if the batter thickens too much.",
    ]
  }
  if (/pasta|noodle/i.test(recipe.name)) {
    const starch =
      ingredients.find((item) => /pasta|noodle/i.test(item)) ?? first
    const additions = ingredients.filter((item) => item !== starch).join(", ")
    return [
      `Bring a pot of salted water to a boil. Prepare the ${additions} while the water heats.`,
      `Cook the ${starch} until just tender, reserving 120 ml of cooking water before draining.`,
      `Cook the remaining ingredients in a wide pan over medium heat, then add the drained ${starch}.`,
      "Toss with a splash of reserved water until glossy and cohesive. Taste, season, and serve hot.",
    ]
  }
  if (/wrap|taco|toast/i.test(recipe.name)) {
    return [
      `Prepare the ${ingredients.join(", ")}. Slice vegetables thinly and season the ${first}.`,
      `Cook or warm the ${first} as needed until safely cooked through and lightly browned.`,
      "Warm the bread or tortillas briefly in a dry pan, then layer on the prepared ingredients.",
      "Finish with a squeeze of citrus or your preferred sauce, fold or slice, and serve immediately.",
    ]
  }
  if (/salad|bowl|box|plate/i.test(recipe.name)) {
    return [
      `Prepare the ${ingredients.join(", ")}. Cook any grains according to their packet directions and let them steam-dry for 5 minutes.`,
      `Season and cook the ${first} as needed. Chop raw vegetables into even bite-size pieces.`,
      "Whisk a simple dressing with 1 teaspoon oil, a squeeze of lemon or vinegar, salt, and pepper.",
      "Arrange everything in a bowl or container, spoon over the dressing, and serve or chill promptly.",
    ]
  }
  if (/soup|curry/i.test(recipe.name)) {
    return [
      `Chop the ${rest}. Pat the ${first} dry and season lightly with salt and pepper.`,
      `Heat a deep pan over medium heat. Cook the ${first} for 4–6 minutes, stirring occasionally.`,
      `Add ${rest} with 250 ml water or stock. Simmer gently for 15–20 minutes until everything is tender.`,
      "Taste, adjust seasoning, and rest off the heat for 3 minutes before serving.",
    ]
  }
  if (/tray|roast|crumble|crispy/i.test(recipe.name)) {
    return [
      "Heat the oven to 200°C / 390°F. Line a tray and prepare all ingredients.",
      `Spread ${ingredients.join(", ")} across the tray, keeping pieces in a single layer. Season and lightly coat with oil.`,
      "Roast for 20–30 minutes, turning once halfway through, until browned and cooked through.",
      "Rest for 3 minutes, finish with fresh herbs or lemon if available, and serve warm.",
    ]
  }
  return [
    `Measure and prepare the ${ingredients.join(", ")}. Cut everything into even, bite-size pieces.`,
    `Heat a wide pan over medium-high heat. Cook the ${first} until browned and cooked through, then set aside if necessary.`,
    `Add ${rest} in order of cooking time. Stir frequently and cook until tender but not mushy.`,
    `Return everything to the pan, toss for 1–2 minutes, taste for seasoning, and serve immediately.`,
  ]
}

export const STARTER_RECIPES: StarterRecipe[] = STARTER_RECIPE_BASE.map(
  (recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map(
      (name) => `${quantityFor(name)} ${name}`
    ),
    steps: detailedMethod(recipe),
    notes:
      "Makes one generous serving. Cool leftovers promptly and refrigerate in a sealed container for up to two days.",
    origin: ORIGIN_BY_RECIPE[recipe.id] ?? "International",
  })
)

const CATEGORIES = [
  "All",
  "Favorites",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Dessert",
] as const
const FAVORITES_KEY = "onerep.recipe-hub.favorites.v1"

function totals(recipe: Recipe) {
  return recipe.ingredients.reduce(
    (sum, item) => ({
      calories:
        sum.calories + Math.round((item.caloriesPer100 * item.grams) / 100),
      protein:
        sum.protein + Math.round((item.proteinPer100 * item.grams) / 100),
    }),
    { calories: 0, protein: 0 }
  )
}

export default function RecipesHub() {
  const navigate = useSmoothNavigate()
  const location = useLocation()
  const routeState = location.state as {
    openStarterRecipeId?: string
    openCommunityRecipeId?: string
  } | null
  const openedRouteRecipeRef = useRef(false)
  const saveRecipe = useMutation(api.logs.recipes.save)
  const setCommunitySharing = useMutation(api.logs.recipes.setCommunitySharing)
  const reportCommunityRecipe = useMutation(
    api.logs.recipes.reportCommunityRecipe
  )
  const addFoodEntry = useMutation(api.logs.foodLogs.addEntry)
  const claimRatingPrompt = useMutation(api.logs.recipes.claimRatingPrompt)
  const rateCommunityRecipe = useMutation(api.logs.recipes.rateCommunityRecipe)
  const savedRecipes = (useQuery(api.logs.recipes.list, {}) ?? []) as Recipe[]
  const communityQuery = useQuery(api.logs.recipes.listCommunity, {
    limit: 60,
  })
  const communityRecipes = useMemo(
    () => (communityQuery ?? []) as Recipe[],
    [communityQuery]
  )
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All")
  const [source, setSource] = useState<
    "all" | "official" | "community" | "mine"
  >("all")
  const [country, setCountry] = useState("All countries")
  const [selected, setSelected] = useState<StarterRecipe | null>(null)
  const [selectedCommunity, setSelectedCommunity] = useState<Recipe | null>(
    null
  )
  const [shareTarget, setShareTarget] = useState<Recipe | null>(null)
  const [shareCountry, setShareCountry] = useState("")
  const [shareAnonymously, setShareAnonymously] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [loggingCommunity, setLoggingCommunity] = useState<Recipe | null>(null)
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null)
  const [ratingRecipe, setRatingRecipe] = useState<Recipe | null>(null)
  const [submittingRating, setSubmittingRating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(safeLocalStorageGet(FAVORITES_KEY) ?? "[]"))
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    if (openedRouteRecipeRef.current) return
    if (routeState?.openStarterRecipeId) {
      const recipe = STARTER_RECIPES.find(
        (item) => item.id === routeState.openStarterRecipeId
      )
      if (recipe) {
        openedRouteRecipeRef.current = true
        setSelected(recipe)
      }
      return
    }
    if (routeState?.openCommunityRecipeId && communityQuery !== undefined) {
      openedRouteRecipeRef.current = true
      const recipe = communityRecipes.find(
        (item) => String(item._id) === routeState.openCommunityRecipeId
      )
      if (recipe) setSelectedCommunity(recipe)
    }
  }, [communityQuery, communityRecipes, routeState])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return STARTER_RECIPES.filter((recipe) => {
      const categoryMatches =
        category === "All" ||
        (category === "Favorites"
          ? favorites.has(recipe.id)
          : recipe.category === category)
      const queryMatches =
        !needle ||
        [
          recipe.name,
          recipe.description,
          recipe.category,
          ...recipe.tags,
          ...recipe.ingredients,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      const countryMatches =
        country === "All countries" || recipe.origin === country
      return categoryMatches && queryMatches && countryMatches
    })
  }, [category, country, favorites, query])

  const filteredCommunity = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return communityRecipes.filter((recipe) => {
      const categoryMatches =
        category === "All" ||
        (category !== "Favorites" && recipe.category === category)
      const countryMatches =
        country === "All countries" || recipe.originCountry === country
      const queryMatches =
        !needle ||
        [
          recipe.name,
          recipe.description,
          recipe.category,
          recipe.originCountry,
          ...(recipe.tags ?? []),
          ...recipe.ingredients.map((item) => item.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)
      return categoryMatches && countryMatches && queryMatches
    })
  }, [category, communityRecipes, country, query])

  const countries = useMemo(
    () => [
      "All countries",
      ...Array.from(
        new Set([
          ...STARTER_RECIPES.map((recipe) => recipe.origin),
          ...communityRecipes
            .map((recipe) => recipe.originCountry)
            .filter((value): value is string => Boolean(value)),
        ])
      ).sort(),
    ],
    [communityRecipes]
  )
  const visibleSavedRecipes = savedRecipes.filter(
    (recipe) => country === "All countries" || recipe.originCountry === country
  )

  function toggleFavorite(id: string) {
    hapticTap()
    setFavorites((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      safeLocalStorageSet(FAVORITES_KEY, JSON.stringify([...next]))
      return next
    })
  }

  function askCoach(recipe: StarterRecipe) {
    hapticSelection()
    navigate("/coach", {
      motion: "forward",
      state: {
        coachMode: "chef",
        recipeRequest: `Create a detailed recipe for ${recipe.name}. Keep this direction: ${recipe.description} Include ${recipe.ingredients.join(", ")}.`,
      },
    })
  }

  async function saveStarter(recipe: StarterRecipe) {
    if (savingId) return
    setSavingId(recipe.id)
    hapticSelection()
    try {
      const ingredientCount = recipe.ingredients.length
      const calorieShare = recipe.calories / ingredientCount
      const proteinShare = recipe.protein / ingredientCount
      const remainingCalories = Math.max(
        0,
        recipe.calories - recipe.protein * 4
      )
      const noCook =
        recipe.tags.includes("no cook") ||
        recipe.tags.includes("no bake") ||
        /smoothie|overnight|chia pudding|yogurt bowl/i.test(recipe.name)
      const carbsShare = (remainingCalories * 0.65) / 4 / ingredientCount
      const fatShare = (remainingCalories * 0.35) / 9 / ingredientCount
      const recipeId = await saveRecipe({
        name: recipe.name,
        recipeType: "detailed",
        description: recipe.description,
        servings: 1,
        prepMinutes: noCook
          ? recipe.time
          : Math.max(5, Math.round(recipe.time * 0.35)),
        cookMinutes: noCook ? 0 : Math.max(1, Math.round(recipe.time * 0.65)),
        category: recipe.category,
        originCountry: recipe.origin,
        notes: recipe.notes,
        placeholderImage: "starter-kitchen",
        tags: recipe.tags,
        steps: recipe.steps,
        photoStorageIds: [],
        ingredients: recipe.ingredients.map((label, index) => {
          const parsedAmount = Number(label.match(/[\d.]+/)?.[0] ?? 100)
          const grams = /\bg\b/i.test(label) ? parsedAmount : 100
          const name = label.replace(/^[\d.]+\s*(?:g|tbsp|serving)?\s*/i, "")
          return {
            id: `${recipe.id}-${index}`,
            name,
            grams,
            displayAmount: grams,
            displayUnit: "g",
            caloriesPer100: (calorieShare * 100) / grams,
            proteinPer100: (proteinShare * 100) / grams,
            carbsPer100: (carbsShare * 100) / grams,
            fatPer100: (fatShare * 100) / grams,
          }
        }),
      })
      hapticTap()
      toast.success(`${recipe.name} saved`)
      setSelected(null)
      navigate(`/foods/recipe/${recipeId}`, { motion: "forward" })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save recipe"
      )
    } finally {
      setSavingId(null)
    }
  }

  async function publishRecipe() {
    if (!shareTarget?._id || !shareCountry.trim() || sharing) return
    setSharing(true)
    try {
      await setCommunitySharing({
        id: shareTarget._id as Id<"recipes">,
        shared: true,
        originCountry: shareCountry.trim(),
        anonymous: shareAnonymously,
      })
      hapticTap()
      toast.success(`${shareTarget.name} shared with the community`)
      setShareTarget(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not share recipe"
      )
    } finally {
      setSharing(false)
    }
  }

  async function unpublishRecipe(recipe: Recipe) {
    if (!recipe._id || sharing) return
    if (!window.confirm(`Remove ${recipe.name} from the OneRep community?`))
      return
    setSharing(true)
    try {
      await setCommunitySharing({
        id: recipe._id as Id<"recipes">,
        shared: false,
      })
      toast.success("Recipe is private again")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update sharing"
      )
    } finally {
      setSharing(false)
    }
  }

  async function reportRecipe(recipe: Recipe) {
    if (!recipe._id || reporting) return
    setReporting(true)
    try {
      await reportCommunityRecipe({ recipeId: recipe._id as Id<"recipes"> })
      hapticTap()
      toast.success("Report received")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not report recipe"
      )
    } finally {
      setReporting(false)
    }
  }

  async function logCommunityRecipe(recipe: Recipe, meal: string) {
    if (!recipe._id || loggingMeal) return
    setLoggingMeal(meal)
    try {
      const nutrition = recipe.ingredients.reduce(
        (sum, item) => ({
          calories: sum.calories + (item.caloriesPer100 * item.grams) / 100,
          protein: sum.protein + (item.proteinPer100 * item.grams) / 100,
          carbs: sum.carbs + (item.carbsPer100 * item.grams) / 100,
          fat: sum.fat + (item.fatPer100 * item.grams) / 100,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )
      await addFoodEntry({
        date: currentDateKey(),
        entry: {
          id: crypto.randomUUID(),
          name: recipe.name,
          calories: Math.round(nutrition.calories),
          protein: Math.round(nutrition.protein),
          carbs: Math.round(nutrition.carbs),
          fat: Math.round(nutrition.fat),
          meal,
          loggedAt: new Date().toISOString(),
          recipeId: recipe._id,
        },
      })
      const shouldPrompt = await claimRatingPrompt({
        recipeId: recipe._id as Id<"recipes">,
      }).catch(() => false)
      hapticTap()
      toast.success(`${recipe.name} logged to ${meal}`)
      setLoggingCommunity(null)
      setSelectedCommunity(null)
      if (shouldPrompt) setRatingRecipe(recipe)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not log recipe"
      )
    } finally {
      setLoggingMeal(null)
    }
  }

  async function submitRating(rating: number) {
    if (!ratingRecipe?._id || submittingRating) return
    setSubmittingRating(true)
    try {
      await rateCommunityRecipe({
        recipeId: ratingRecipe._id as Id<"recipes">,
        rating,
      })
      hapticTap()
      toast.success("Thanks for rating this recipe")
      setRatingRecipe(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save rating"
      )
    } finally {
      setSubmittingRating(false)
    }
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background text-foreground lg:pr-8 lg:pl-72">
      <main className="mx-auto min-h-svh w-full max-w-6xl pb-[calc(var(--app-safe-bottom-lg)+2rem)]">
        <NavigationBar
          title="Recipes"
          leading={
            <ToolbarButton
              onClick={() => navigate("/nutrition", { motion: "back" })}
              aria-label="Back to nutrition"
            >
              <ArrowLeft size={20} weight="bold" />
            </ToolbarButton>
          }
          trailing={
            <ToolbarButton
              onClick={() =>
                navigate("/foods/recipe/new", { motion: "forward" })
              }
              aria-label="Create recipe"
            >
              <Plus size={20} weight="bold" />
            </ToolbarButton>
          }
        />

        <div className="px-[var(--app-page-x)]">
          <section className="overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#17152e_0%,#31275d_55%,#8c583c_140%)] px-5 py-6 text-white md:px-8 md:py-8">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-white/55 uppercase">
                Your kitchen
              </p>
              <h1 className="mt-2 text-[2rem] leading-[1.05] font-semibold tracking-[-0.04em] md:text-[2.65rem]">
                Find something worth cooking.
              </h1>
              <p className="mt-3 max-w-md text-[14px] leading-6 text-white/65">
                Thirty practical starting points, plus every recipe you save
                with Coach or build yourself.
              </p>
            </div>
            <div className="relative mt-6">
              <MagnifyingGlass
                size={18}
                className="absolute top-1/2 left-4 -translate-y-1/2 text-white/55"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search dishes, ingredients, or tags"
                aria-label="Search recipes"
                className="min-h-13 w-full rounded-2xl border border-white/10 bg-white/10 pr-11 pl-11 text-[14px] text-white backdrop-blur outline-none placeholder:text-white/45 focus:border-white/25"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear recipe search"
                  className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center text-white/55"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </section>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
              aria-label="Recipe source"
            >
              {(
                [
                  ["all", "All recipes"],
                  ["official", "OneRep"],
                  ["community", "Community"],
                  ["mine", "My recipes"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSource(value)}
                  className={`min-h-10 shrink-0 rounded-full px-4 text-[12px] font-semibold ${source === value ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3 text-[12px] text-muted-foreground">
              <GlobeHemisphereWest size={15} />
              <span className="sr-only">Country of origin</span>
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="appearance-none bg-transparent pr-4 font-semibold text-foreground outline-none"
                aria-label="Filter by country of origin"
              >
                {countries.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(source === "all" || source === "mine") &&
            visibleSavedRecipes.length > 0 && (
              <section className="mt-8" aria-labelledby="saved-recipes-title">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <h2
                      id="saved-recipes-title"
                      className="text-[20px] font-semibold tracking-[-0.02em]"
                    >
                      My recipes
                    </h2>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      Saved by you and Chef Coach
                    </p>
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {visibleSavedRecipes.length}
                  </span>
                </div>
                <div className="flex snap-x gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
                  {visibleSavedRecipes.map((recipe) => {
                    const nutrition = totals(recipe)
                    const image =
                      recipe.photoUrls?.[0] ??
                      (recipe.placeholderImage
                        ? COACH_RECIPE_PLACEHOLDER
                        : undefined)
                    return (
                      <article
                        key={recipe._id ?? recipe.name}
                        className="relative min-w-[78%] snap-start overflow-hidden rounded-3xl border border-border bg-card text-left sm:min-w-72"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            recipe._id &&
                            navigate(`/foods/recipe/${recipe._id}`, {
                              motion: "forward",
                            })
                          }
                          className="block w-full text-left"
                        >
                          {image ? (
                            <img
                              src={image}
                              alt=""
                              className="h-28 w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-28 place-items-center bg-muted/40">
                              <ForkKnife
                                size={25}
                                className="text-muted-foreground"
                              />
                            </div>
                          )}
                        </button>
                        <div className="p-4 pr-14">
                          <p className="truncate text-[16px] font-semibold">
                            {recipe.name}
                          </p>
                          <p className="mt-1 text-[12px] text-muted-foreground">
                            {nutrition.calories} kcal · {nutrition.protein}g
                            protein · {recipe.ingredients.length} ingredients
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            recipe.isCommunityShared
                              ? void unpublishRecipe(recipe)
                              : (setShareTarget(recipe),
                                setShareCountry(recipe.originCountry ?? ""),
                                setShareAnonymously(false))
                          }
                          className="absolute right-3 bottom-3 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"
                          aria-label={
                            recipe.isCommunityShared
                              ? `Stop sharing ${recipe.name}`
                              : `Share ${recipe.name} with the community`
                          }
                        >
                          {recipe.isCommunityShared ? (
                            <SealCheck
                              size={18}
                              weight="fill"
                              className="text-violet-500"
                            />
                          ) : (
                            <ShareNetwork size={18} />
                          )}
                        </button>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}

          {(source === "all" || source === "official") && (
            <section className="mt-8" aria-labelledby="discover-recipes-title">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2
                    id="discover-recipes-title"
                    className="text-[20px] font-semibold tracking-[-0.02em]"
                  >
                    Discover
                  </h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {filtered.length} recipes
                  </p>
                </div>
                <SlidersHorizontal
                  size={19}
                  className="text-muted-foreground"
                />
              </div>
              <div
                className="mt-4 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
                aria-label="Recipe categories"
              >
                {CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setCategory(item)
                    }}
                    className={`min-h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-colors ${category === item ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div className="mt-8 rounded-3xl border border-border py-12 text-center">
                  <MagnifyingGlass
                    size={25}
                    className="mx-auto text-muted-foreground"
                  />
                  <p className="mt-3 font-semibold">No matching recipes</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("")
                      setCategory("All")
                    }}
                    className="mt-2 text-[13px] font-semibold text-muted-foreground"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((recipe) => (
                    <article
                      key={recipe.id}
                      className="group overflow-hidden rounded-3xl border border-border bg-card shadow-[0_18px_45px_-38px_rgba(0,0,0,0.65)]"
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(recipe)}
                        className="relative block h-44 w-full overflow-hidden text-left"
                      >
                        <img
                          src={recipe.image}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                        <span className="absolute top-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[13px] font-semibold text-white backdrop-blur">
                          {recipe.category}
                        </span>
                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[13px] font-semibold text-black shadow-sm backdrop-blur">
                          <SealCheck size={11} weight="fill" /> Created by
                          OneRep
                        </span>
                      </button>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setSelected(recipe)}
                            className="min-w-0 text-left"
                          >
                            <h3 className="truncate text-[17px] font-semibold tracking-[-0.02em]">
                              {recipe.name}
                            </h3>
                            <p className="mt-1 line-clamp-2 min-h-10 text-[13px] leading-5 text-muted-foreground">
                              {recipe.description}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(recipe.id)}
                            aria-label={`${favorites.has(recipe.id) ? "Remove" : "Add"} ${recipe.name} ${favorites.has(recipe.id) ? "from" : "to"} favorites`}
                            className="grid size-10 shrink-0 place-items-center rounded-full bg-muted/55"
                          >
                            <Heart
                              size={18}
                              weight={
                                favorites.has(recipe.id) ? "fill" : "regular"
                              }
                              className={
                                favorites.has(recipe.id)
                                  ? "text-rose-500"
                                  : "text-muted-foreground"
                              }
                            />
                          </button>
                        </div>
                        <div className="mt-4 flex items-center gap-3 border-t border-border/65 pt-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={13} />
                            {recipe.time} min
                          </span>
                          <span>{recipe.calories} kcal</span>
                          <span>{recipe.protein}g protein</span>
                          <span className="ml-auto truncate">
                            {recipe.origin}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {(source === "all" || source === "community") && (
            <section
              className="mt-10 border-t border-border pt-8"
              aria-labelledby="community-recipes-title"
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2
                    id="community-recipes-title"
                    className="text-[20px] font-semibold tracking-[-0.02em]"
                  >
                    From the community
                  </h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Recipes members chose to share
                  </p>
                </div>
                <span className="text-[12px] text-muted-foreground">
                  {filteredCommunity.length}
                </span>
              </div>
              {filteredCommunity.length === 0 ? (
                <div className="mt-5 rounded-3xl border border-dashed border-border py-10 text-center">
                  <ShareNetwork
                    size={23}
                    className="mx-auto text-muted-foreground"
                  />
                  <p className="mt-2 text-[14px] font-semibold">
                    No shared recipes match these filters
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Share one of your recipes to help start the table.
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredCommunity.map((recipe) => {
                    const nutrition = totals(recipe)
                    const image =
                      recipe.photoUrls?.[0] ??
                      (recipe.placeholderImage
                        ? COACH_RECIPE_PLACEHOLDER
                        : undefined)
                    return (
                      <article
                        key={recipe._id ?? recipe.name}
                        className="overflow-hidden rounded-3xl border border-border bg-card"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedCommunity(recipe)}
                          className="block w-full text-left"
                        >
                          {image ? (
                            <img
                              src={image}
                              alt=""
                              loading="lazy"
                              className="h-36 w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-36 place-items-center bg-muted/40">
                              <ForkKnife
                                size={24}
                                className="text-muted-foreground"
                              />
                            </div>
                          )}
                          <div className="p-4">
                            <div className="flex items-center justify-between gap-3 text-[13px] font-medium text-muted-foreground">
                              <span>
                                By{" "}
                                {recipe.communityAuthorName ?? "OneRep member"}
                              </span>
                              {recipe.originCountry && (
                                <span className="flex items-center gap-1">
                                  <GlobeHemisphereWest size={12} />
                                  {recipe.originCountry}
                                </span>
                              )}
                            </div>
                            <h3 className="mt-2 text-[17px] font-semibold">
                              {recipe.name}
                            </h3>
                            {recipe.description && (
                              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                                {recipe.description}
                              </p>
                            )}
                            <p className="mt-3 text-[11px] text-muted-foreground">
                              {nutrition.calories} kcal · {nutrition.protein}g
                              protein · {recipe.ingredients.length} ingredients
                            </p>
                            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Star
                                size={14}
                                weight={recipe.ratingCount ? "fill" : "regular"}
                                className={
                                  recipe.ratingCount
                                    ? "text-amber-500"
                                    : undefined
                                }
                              />
                              {recipe.ratingCount
                                ? `${((recipe.ratingTotal ?? 0) / recipe.ratingCount).toFixed(1)} (${recipe.ratingCount})`
                                : "Not rated yet"}
                            </div>
                            <p className="mt-4 border-t border-border pt-3 text-[12px] font-semibold">
                              View recipe
                            </p>
                          </div>
                        </button>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {shareTarget && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center md:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-recipe-title"
        >
          <div className="w-full max-w-md rounded-t-[2rem] bg-background p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:rounded-[2rem] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  OneRep community
                </p>
                <h2
                  id="share-recipe-title"
                  className="mt-1 text-[22px] font-semibold"
                >
                  Share {shareTarget.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShareTarget(null)}
                aria-label="Close sharing dialog"
                className="grid size-10 place-items-center rounded-full bg-muted"
              >
                <X size={15} />
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
              Its recipe details, nutrition estimates, photos, your display
              name, and country of origin will be visible to signed-in OneRep
              members. You can unshare it at any time.
            </p>
            <label className="mt-5 block">
              <span className="text-[12px] font-semibold">
                Country of origin
              </span>
              <input
                value={shareCountry}
                onChange={(event) => setShareCountry(event.target.value)}
                placeholder="e.g. Italy"
                aria-label="Recipe country of origin"
                className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-muted/25 px-4 text-[14px] outline-none focus:border-foreground/35"
              />
            </label>
            <label className="mt-4 flex items-start gap-3 rounded-2xl bg-muted/45 p-3.5">
              <input
                type="checkbox"
                checked={shareAnonymously}
                onChange={(event) => setShareAnonymously(event.target.checked)}
                className="mt-0.5 size-4 accent-foreground"
              />
              <span>
                <span className="block text-[13px] font-semibold">
                  Share anonymously
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                  Your display name will be replaced with “Anonymous”.
                </span>
              </span>
            </label>
            <button
              type="button"
              disabled={!shareCountry.trim() || sharing}
              aria-busy={sharing}
              onClick={() => void publishRecipe()}
              className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-[14px] font-semibold text-background disabled:opacity-40"
            >
              <ShareNetwork size={17} />
              {sharing ? "Sharing…" : "Share with community"}
            </button>
          </div>
        </div>
      )}

      {selectedCommunity &&
        (() => {
          const recipe = selectedCommunity
          const nutrition = totals(recipe)
          const image =
            recipe.photoUrls?.[0] ??
            (recipe.placeholderImage ? COACH_RECIPE_PLACEHOLDER : undefined)
          return (
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center md:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="community-recipe-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setSelectedCommunity(null)
              }}
            >
              <div className="max-h-[90svh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-background md:rounded-[2rem]">
                <div className="relative h-56">
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center bg-muted">
                      <ForkKnife size={28} className="text-muted-foreground" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedCommunity(null)}
                    aria-label="Close community recipe"
                    className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-7">
                  <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground">
                    <span>
                      By {recipe.communityAuthorName ?? "OneRep member"}
                    </span>
                    {recipe.originCountry && (
                      <span className="flex items-center gap-1">
                        <GlobeHemisphereWest size={13} />
                        {recipe.originCountry}
                      </span>
                    )}
                  </div>
                  <h2
                    id="community-recipe-title"
                    className="mt-2 text-[1.8rem] leading-tight font-semibold tracking-[-0.035em]"
                  >
                    {recipe.name}
                  </h2>
                  {recipe.description && (
                    <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
                      {recipe.description}
                    </p>
                  )}
                  <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border py-3 text-center">
                    <div>
                      <p className="text-[15px] font-semibold">
                        {(recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)}m
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        Total time
                      </p>
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold">
                        {nutrition.calories}
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        Calories
                      </p>
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold">
                        {nutrition.protein}g
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        Protein
                      </p>
                    </div>
                  </div>
                  <div className="mt-6">
                    <h3 className="text-[13px] font-semibold">Ingredients</h3>
                    <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
                      {recipe.ingredients.map((item) => (
                        <li
                          key={item.id}
                          className="py-2.5 text-[13px] text-foreground/75"
                        >
                          {Math.round(item.grams)}g {item.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {recipe.steps?.length ? (
                    <div className="mt-7">
                      <h3 className="text-[13px] font-semibold">
                        Instructions
                      </h3>
                      <ol className="mt-3 space-y-4">
                        {recipe.steps.map((step, index) => (
                          <li
                            key={`${step}-${index}`}
                            className="flex gap-3 text-[13px] leading-5 text-foreground/75"
                          >
                            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {recipe.notes && (
                    <div className="mt-6 rounded-2xl bg-muted/55 p-4">
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        Notes
                      </p>
                      <p className="mt-1 text-[12px] leading-5 text-foreground/70">
                        {recipe.notes}
                      </p>
                    </div>
                  )}
                  {!recipe.isOwnedByViewer && (
                    <button
                      type="button"
                      onClick={() => setLoggingCommunity(recipe)}
                      className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[14px] font-semibold text-background"
                    >
                      <ForkKnife size={17} />
                      Log recipe
                    </button>
                  )}
                  {recipe.isOwnedByViewer ? (
                    <button
                      type="button"
                      disabled={sharing}
                      onClick={() => {
                        void unpublishRecipe(recipe)
                        setSelectedCommunity(null)
                      }}
                      className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/25 text-[13px] font-semibold text-destructive"
                    >
                      <X size={15} />
                      Take down from public search
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={reporting}
                      aria-busy={reporting}
                      onClick={() => void reportRecipe(recipe)}
                      className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border text-[13px] font-semibold text-muted-foreground"
                    >
                      <Flag size={15} />
                      {reporting ? "Reporting…" : "Report recipe"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

      {loggingCommunity && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center md:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-community-recipe-title"
        >
          <div className="w-full max-w-sm rounded-t-[2rem] bg-background p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:rounded-[2rem]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Add to today
                </p>
                <h2
                  id="log-community-recipe-title"
                  className="mt-1 text-[22px] font-semibold"
                >
                  Log {loggingCommunity.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLoggingCommunity(null)}
                disabled={Boolean(loggingMeal)}
                aria-label="Close meal selection"
                className="grid size-10 place-items-center rounded-full bg-muted disabled:opacity-40"
              >
                <X size={15} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {["Breakfast", "Lunch", "Dinner", "Snack"].map((meal) => (
                <button
                  key={meal}
                  type="button"
                  disabled={Boolean(loggingMeal)}
                  aria-busy={loggingMeal === meal}
                  onClick={() =>
                    void logCommunityRecipe(loggingCommunity, meal)
                  }
                  className="min-h-12 rounded-2xl border border-border bg-card px-3 text-[13px] font-semibold disabled:opacity-45"
                >
                  {loggingMeal === meal ? "Logging…" : meal}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {ratingRecipe && (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center md:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rate-recipe-title"
        >
          <div className="w-full max-w-sm rounded-t-[2rem] bg-background p-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] text-center md:rounded-[2rem]">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-500/12 text-amber-500">
              <Star size={24} weight="fill" />
            </div>
            <h2
              id="rate-recipe-title"
              className="mt-4 text-[22px] font-semibold"
            >
              How was {ratingRecipe.name}?
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
              Your rating helps everyone find recipes worth making.
            </p>
            <div
              className="mt-5 flex justify-center gap-1"
              aria-label="Rate from 1 to 5 stars"
            >
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  disabled={submittingRating}
                  onClick={() => void submitRating(rating)}
                  aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
                  className="grid size-12 place-items-center rounded-full text-amber-500 transition-transform active:scale-90 disabled:opacity-40"
                >
                  <Star size={29} weight="regular" />
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={submittingRating}
              onClick={() => setRatingRecipe(null)}
              className="mt-3 min-h-11 px-5 text-[13px] font-semibold text-muted-foreground disabled:opacity-40"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm md:items-center md:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipe-preview-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null)
          }}
        >
          <div className="max-h-[90svh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-background md:rounded-[2rem]">
            <div className="relative h-56">
              <img
                src={selected.image}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close recipe preview"
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-7">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                {selected.category} · {selected.difficulty}
              </p>
              <h2
                id="recipe-preview-title"
                className="mt-2 text-[1.8rem] leading-tight font-semibold tracking-[-0.035em]"
              >
                {selected.name}
              </h2>
              <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
                {selected.description}
              </p>
              <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border py-3 text-center">
                <div>
                  <p className="text-[15px] font-semibold">{selected.time}m</p>
                  <p className="text-[13px] text-muted-foreground">
                    Total time
                  </p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold">
                    {selected.calories}
                  </p>
                  <p className="text-[13px] text-muted-foreground">Calories</p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold">
                    {selected.protein}g
                  </p>
                  <p className="text-[13px] text-muted-foreground">Protein</p>
                </div>
              </div>
              <div className="mt-6">
                <h3 className="text-[13px] font-semibold">Ingredients</h3>
                <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
                  {selected.ingredients.map((ingredient) => (
                    <li
                      key={ingredient}
                      className="py-2.5 text-[13px] text-foreground/75"
                    >
                      {ingredient}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-7">
                <h3 className="text-[13px] font-semibold">Instructions</h3>
                <ol className="mt-3 space-y-4">
                  {selected.steps.map((step, index) => (
                    <li
                      key={step}
                      className="flex gap-3 text-[13px] leading-5 text-foreground/75"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-6 rounded-2xl bg-muted/55 p-4">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Serving & storage
                </p>
                <p className="mt-1 text-[12px] leading-5 text-foreground/70">
                  {selected.notes}
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(savingId)}
                aria-busy={savingId === selected.id}
                onClick={() => void saveStarter(selected)}
                className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-[14px] font-semibold text-background"
              >
                <Check size={18} weight="bold" />
                {savingId === selected.id ? "Saving…" : "Save to my recipes"}
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                disabled={Boolean(savingId)}
                onClick={() => askCoach(selected)}
                className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 text-[13px] font-semibold text-foreground/75"
              >
                <ChefHat size={17} /> Customize with Chef Coach
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

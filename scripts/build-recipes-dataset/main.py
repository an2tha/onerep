import json
import re
import urllib.request
from collections import Counter
from pathlib import Path


SOURCE_URL = (
    "https://huggingface.co/datasets/gossminn/wikibooks-cookbook/resolve/"
    "main/recipes_parsed.mini.json"
)
OUTPUT_PATH = Path(__file__).with_name("recipes-500.json")
LICENSE = "CC BY-SA 4.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
INSTRUCTION_SECTIONS = {
    "procedure",
    "directions",
    "instructions",
    "method",
    "preparation",
}


def normalized_section(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def clean_category(value: str | None) -> str | None:
    if not value:
        return None
    return value.removeprefix("/wiki/Category:").replace("_", " ")


def parse_recipe(item: dict) -> dict | None:
    data = item.get("recipe_data", {})
    lines = data.get("text_lines", [])
    ingredients = [
        line["text"].strip()
        for line in lines
        if normalized_section(line.get("section")) == "ingredients"
        and line.get("line_type") in {"ul", "ol"}
        and line.get("text", "").strip()
    ]
    steps = [
        line["text"].strip()
        for line in lines
        if normalized_section(line.get("section")) in INSTRUCTION_SECTIONS
        and line.get("line_type") in {"ol", "ul", "p"}
        and line.get("text", "").strip()
        # Gallery captions in the source sometimes appear as "1. caption" inside
        # the procedure section; they duplicate rather than extend the method.
        and not re.match(r"^\d+\.\s", line.get("text", "").strip())
    ]
    title = data.get("title", "").strip()
    if (
        not title
        or len(ingredients) < 3
        or len(steps) < 2
        or sum(map(len, steps)) < 100
        or any(len(step) < 8 for step in steps)
    ):
        return None

    infobox = data.get("infobox") or {}
    return {
        "title": title,
        "category": clean_category(infobox.get("category")),
        "servings": infobox.get("servings"),
        "time": infobox.get("time"),
        "difficulty": infobox.get("difficulty"),
        "ingredients": ingredients,
        "steps": steps,
        "source_url": data.get("url"),
        "license": LICENSE,
    }


def quality_score(recipe: dict) -> tuple:
    return (
        bool(recipe["time"]),
        bool(recipe["servings"]),
        min(len(recipe["steps"]), 10),
        min(len(recipe["ingredients"]), 20),
        min(sum(map(len, recipe["steps"])), 1500),
        recipe["title"],
    )


def select_diverse(recipes: list[dict], count: int = 500) -> list[dict]:
    selected = []
    category_counts: Counter[str] = Counter()
    seen_titles = set()
    for recipe in sorted(recipes, key=quality_score, reverse=True):
        title_key = re.sub(r"\W+", "", recipe["title"].casefold())
        category = recipe["category"] or "Uncategorized"
        if title_key in seen_titles or category_counts[category] >= 20:
            continue
        selected.append(recipe)
        seen_titles.add(title_key)
        category_counts[category] += 1
        if len(selected) == count:
            return sorted(selected, key=lambda recipe: recipe["title"].casefold())
    raise RuntimeError(f"Only {len(selected)} recipes passed diversity constraints")


def main() -> None:
    with urllib.request.urlopen(SOURCE_URL) as response:
        raw_recipes = json.load(response)

    candidates = [recipe for item in raw_recipes if (recipe := parse_recipe(item))]
    recipes = select_diverse(candidates)
    payload = {
        "metadata": {
            "title": "500 practical recipes from the Wikibooks Cookbook",
            "recipe_count": len(recipes),
            "source_dataset": "gossminn/wikibooks-cookbook",
            "source_dataset_url": "https://huggingface.co/datasets/gossminn/wikibooks-cookbook",
            "original_source": "https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents",
            "license": LICENSE,
            "license_url": LICENSE_URL,
            "selection": (
                "Deterministic quality filter: at least 3 ingredients, at least 2 "
                "ordered preparation steps, at least 100 instruction characters, "
                "unique titles, and no more than 20 recipes per category."
            ),
            "attribution": (
                "Recipe text is contributed by Wikibooks editors. Each recipe includes "
                "its source URL for attribution and contributor history."
            ),
        },
        "recipes": recipes,
    }
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(recipes)} recipes to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

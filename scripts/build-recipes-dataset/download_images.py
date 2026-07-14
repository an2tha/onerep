"""Find fitting food images from TheMealDB and download them."""

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "recipes-500.json"
IMAGE_DIR = ROOT / "recipe-images"
API = "https://www.themealdb.com/api/json/v1/1/search.php"
UA = "onerep-recipe-image-downloader/1.0 (research; contact repository owner)"


def request_json(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def find_image(title: str) -> dict | None:
    query = re.sub(r"\b(recipe|with|and|the|i|ii)\b", " ", title, flags=re.I)
    result = request_json({"s": query.strip()})
    meals = result.get("meals") or []
    if not meals or not meals[0].get("strMealThumb"):
        return None
    meal = meals[0]
    return {
        "provider": "TheMealDB",
        "provider_recipe": meal.get("strMeal"),
        "image_url": meal["strMealThumb"],
        "source_url": f"https://www.themealdb.com/meal/{meal.get('idMeal')}",
        "license": "TheMealDB terms apply; retain source URL",
    }


def fallback_image(title: str, seed: int) -> dict:
    """Use tagged Flickr-backed food photography when TheMealDB has no match."""
    tags = re.sub(r"[^a-zA-Z0-9 ]", "", title).replace(" ", ",")
    url = f"https://loremflickr.com/1200/900/{urllib.parse.quote(tags)},food?lock={seed}"
    return {
        "provider": "LoremFlickr (Flickr-tagged search)",
        "query": title,
        "image_url": url,
        "source_url": url,
        "license": "Verify the individual Flickr image license before redistribution",
    }


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    IMAGE_DIR.mkdir(exist_ok=True)
    found = 0
    for index, recipe in enumerate(payload["recipes"], start=1):
        if recipe.get("image"):
            found += 1
            continue
        try:
            # TheMealDB is a high-quality exact-match source, but its catalog is
            # small. Use keyword-tagged food photography for complete coverage.
            image = fallback_image(recipe["title"], index)
            if image and image.get("image_url"):
                suffix = ".jpg"
                filename = f"{index:03d}{suffix}"
                path = IMAGE_DIR / filename
                request = urllib.request.Request(image["image_url"], headers={"User-Agent": UA})
                with urllib.request.urlopen(request, timeout=30) as response:
                    path.write_bytes(response.read())
                image["local_path"] = str(path.relative_to(ROOT))
                recipe["image"] = image
                found += 1
        except Exception as exc:
            print(f"Skipping {recipe['title']}: {exc}")
        if index % 25 == 0:
            DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Processed {index}/500; downloaded {found}")
        time.sleep(0.1)
    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Downloaded {found}/500 images to {IMAGE_DIR}")


if __name__ == "__main__":
    main()

# Recipe dataset builder

Builds `recipes-500.json`, a curated, deterministic subset of the openly licensed
[Wikibooks Cookbook dataset](https://huggingface.co/datasets/gossminn/wikibooks-cookbook).

Run:

```sh
python main.py
```

The output contains 500 recipes with titles, ingredients, ordered preparation
steps, basic metadata, source URLs, and license fields. Recipes are filtered for
completeness and capped at 20 entries per category to avoid a lopsided collection.

`download_images.py` optionally searches TheMealDB for matching food photography
and saves the image URL, provider recipe, and local file path into each match.
TheMealDB does not cover every Wikibooks recipe, so unmatched recipes are left
without an image rather than assigned an unrelated photograph.

## License and attribution

Recipe text is from the [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents)
and is available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Keep the source URL and license metadata when redistributing the data. The builder
code itself follows the repository's license.

## Other useful sources

- [Recipe Commons](https://recipecommons.org/) is a promising CC-license-aware,
  Git-friendly recipe format and repository, but it is currently early alpha.
- [TheMealDB](https://www.themealdb.com/api.php) is convenient for prototyping via
  API, but its terms and supporter tiers should be checked for the intended use.
- Commercial APIs such as Spoonacular or Edamam can add nutrition and search, but
  their terms generally make them a poor fit for a redistributable bulk download.

import { Client } from "@elastic/elasticsearch";

const esClient = new Client({
  node: process.env.ELASTIC_URL || "http://127.0.0.1:9200",
});

export const foodsIndexMapping = {
  mappings: {
    properties: {
      code: { type: "keyword" as const },
      product_name: { type: "text" as const, analyzer: "standard" },
      brands: {
        type: "text" as const,
        fields: { keyword: { type: "keyword" as const } },
      },
      categories: {
        type: "text" as const,
        fields: { keyword: { type: "keyword" as const } },
      },
      nutriscore_grade: { type: "keyword" as const },
      nutriscore_score: { type: "integer" as const },
      nova_group: { type: "integer" as const },
      ingredients_text: { type: "text" as const },
      main_category: { type: "keyword" as const },
      countries: { type: "keyword" as const },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
  },
};

export const exercisesIndexMapping = {
  mappings: {
    properties: {
      id: { type: "keyword" as const },
      name: { type: "text" as const, analyzer: "standard" },
      force: { type: "keyword" as const },
      equipment: { type: "keyword" as const },
      primaryMuscles: {
        type: "text" as const,
        fields: { keyword: { type: "keyword" as const } },
      },
      secondaryMuscles: {
        type: "text" as const,
        fields: { keyword: { type: "keyword" as const } },
      },
      category: { type: "keyword" as const },
      instructions: { type: "text" as const },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
  },
};

export const createIndices = async () => {
  try {
    const foodsExists = await esClient.indices.exists({ index: "foods" });
    if (!foodsExists) {
      await esClient.indices.create({ index: "foods", ...foodsIndexMapping });
      console.log("[ES] Foods index created");
    }

    const exercisesExists = await esClient.indices.exists({
      index: "exercises",
    });
    if (!exercisesExists) {
      await esClient.indices.create({
        index: "exercises",
        ...exercisesIndexMapping,
      });
      console.log("[ES] Exercises index created");
    }
  } catch (err) {
    console.error("[ES] Index creation error:", err);
  }
};

export { esClient };

import mongoose, { Schema } from "mongoose";

export const ProductSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    product_name: String,
    generic_name: String,
    brands: { type: String, index: true },
    quantity: String,
    categories: String,
    main_category: String,
    labels: String,
    nutriscore_grade: { type: String, uppercase: true },
    nutriscore_score: Number,
    nova_group: Number,
    nutrition_data_per: { type: String, enum: ["100g", "serving"], default: "100g" },
    nutriments: [{ name: String, value: Number, unit: String, "100g": Number, serving: Number }],
    ingredients_text: String,
    ingredients_n: Number,
    allergens: String,
    traces: String,
    additives_n: Number,
    images: [
      {
        key: String,
        imgid: Number,
        rev: Number,
        sizes: {
          100: { h: Number, w: Number },
          200: { h: Number, w: Number },
          400: { h: Number, w: Number },
          full: { h: Number, w: Number },
        },
        uploaded_t: Number,
        uploader: String,
      },
    ],
    countries: String,
    stores: String,
    last_modified_t: Number,
  },
  { timestamps: true },
);

ProductSchema.index({ brands: "text", "product_name.text": "text" });
ProductSchema.index({ nutriscore_grade: 1 });
ProductSchema.index({ nutriscore_score: 1 });
ProductSchema.index({ categories: 1 });
ProductSchema.index({ code: 1 }, { unique: true });
ProductSchema.index({ createdAt: -1 });

export const Foods =
  mongoose.models.Product || mongoose.model("Product", ProductSchema);

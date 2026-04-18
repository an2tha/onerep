import mongoose, { Schema } from "mongoose";
import mongoosastic from "mongoosastic";

export const ProductSchema = new Schema({
  code: { type: String, required: true, unique: true, index: true, es_indexed: true },
  product_name: [{ 
    lang: String, 
    text: { type: String, es_indexed: true, es_type: 'text' } 
  }],
  generic_name: [{ 
    lang: String, 
    text: { type: String, es_indexed: true } 
  }],
  brands: { type: String, index: true, es_indexed: true },
  quantity: String,
  categories: { type: String, es_indexed: true },
  main_category: { type: String, es_indexed: true }, 
  labels: String,
  nutriscore_grade: { type: String, uppercase: true, es_indexed: true },
  nutriscore_score: { type: Number, es_indexed: true },
  nova_group: { type: Number, es_indexed: true },
  nutrition_data_per: { type: String, enum: ['100g', 'serving'], default: '100g' },
  nutriments: [{
    name: String,
    value: Number,
    unit: String,
    '100g': Number,
    serving: Number
  }],
  ingredients_text: [{ 
    lang: String, 
    text: { type: String, es_indexed: true } 
  }],
  ingredients_n: Number,
  allergens: { type: String, es_indexed: true },
  traces: String,
  additives_n: Number,
  images: [{
    key: String,
    imgid: Number,
    rev: Number,
    sizes: {
      100: { h: Number, w: Number },
      200: { h: Number, w: Number },
      400: { h: Number, w: Number },
      full: { h: Number, w: Number }
    },
    uploaded_t: Number,
    uploader: String
  }],
  countries: { type: String, es_indexed: true },
  stores: String,
  last_modified_t: Number
}, { 
  timestamps: true 
});

ProductSchema.index({ brands: 'text', 'product_name.text': 'text' });

console.log(`[ES-INIT] Host: ${process.env.ELASTIC_URL}`);

ProductSchema.plugin(mongoosastic as any, {
  hosts: [process.env.ELASTIC_URL!],
  sniffOnStart: false,
  sniffOnConnectionFault: false
});

export const Foods = mongoose.models.Product || mongoose.model('Product', ProductSchema);

const ProductModel = (Foods as any);

ProductModel.createMapping((err: any) => {
  if (err) {
    console.error("[ES-MAPPING-ERR]", err);
  } else {
    console.log("[ES-MAPPING-SUCCESS]");
    const stream = ProductModel.synchronize();
    let count = 0;
    stream.on('data', () => {
      count++;
      if (count % 50 === 0) console.log(`[ES-SYNC] ${count}...`);
    });
    stream.on('close', () => console.log(`[ES-SYNC-COMPLETE] ${count}`));
    stream.on('error', (err: any) => console.error("[ES-SYNC-ERR]", err));
  }
});
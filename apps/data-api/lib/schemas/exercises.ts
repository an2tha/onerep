import mongoose, { Schema } from "mongoose";

export const exercisesSchema = new Schema({
  id: { type: String, unique: true, index: true },
  name: { type: String, index: true },
  force: String,
  equipment: String,
  primaryMuscles: [String],
  secondaryMuscles: [String],
  instructions: [String],
  category: String,
  images: [String],
});

exercisesSchema.index({ name: "text", primaryMuscles: "text" });
exercisesSchema.index({ primaryMuscles: 1 });
exercisesSchema.index({ equipment: 1 });
exercisesSchema.index({ category: 1 });
exercisesSchema.index({ force: 1 });
exercisesSchema.index({ id: 1 }, { unique: true });

export const Exercises =
  mongoose.models.Exercises || mongoose.model("Exercises", exercisesSchema);

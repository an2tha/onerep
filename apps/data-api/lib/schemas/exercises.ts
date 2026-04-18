import mongoose, { Schema } from "mongoose";
import mongoosastic from "mongoosastic";

export const exercisesSchema = new Schema({
    id: { type: String, unique: true, index: true, es_indexed: true },
    name: { type: String, index: true, es_indexed: true, es_type: 'text' },
    force: { type: String, es_indexed: true },
    equipment: { type: String, es_indexed: true },
    primaryMuscles: { type: [String], es_indexed: true },
    secondaryMuscles: { type: [String], es_indexed: true },
    instructions: { type: [String], es_indexed: true },
    category: { type: String, es_indexed: true },
    images: [String]
});

exercisesSchema.index({ name: 'text', primaryMuscles: 'text' });

exercisesSchema.plugin(mongoosastic as any, {
    hosts: [process.env.ELASTIC_URL || 'localhost:9200']
});

export const Exercises = mongoose.models.Exercises || mongoose.model("Exercises", exercisesSchema);

const ExercisesModel = (Exercises as any);
ExercisesModel.createMapping((err: any) => {
    if (!err) {
        const stream = ExercisesModel.synchronize();
        let count = 0;
        stream.on('data', () => count++);
        stream.on('error', (err: any) => console.log(err));
    }
});
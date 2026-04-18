import mongoose from "mongoose";

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is not defined in environment variables");
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("[INFO] MongoDB connected");
  })
  .catch((err) => {
    console.error("[ERR] MongoDB connection error:", err);
    process.exit(1); 
  });
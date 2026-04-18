import dotenv from "dotenv";
dotenv.config();

import createError, { HttpError } from "http-errors";
import express, { type Request, type Response, type NextFunction, type Express } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";

import indexRouter from "./routes/index";
import apiRouter from "./routes/api";
import "./lib/db";

const app: Express = express();

const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.INDEV === "true") {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  const secret = process.env.API_SECRET;

  if (!apiKey || apiKey !== secret) {
    return next(createError(401, "Invalid or missing API secret"));
  }
  next();
};

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(validateApiKey);

app.use("/", indexRouter);
app.use("/api/v1", apiRouter)

app.use((req: Request, res: Response, next: NextFunction) => {
  next(createError(404));
});

app.use((err: HttpError, req: Request, res: Response, next: NextFunction) => {
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: req.app.get("env") === "development" ? err : {}
  });
});

export default app;
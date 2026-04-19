import dotenv from "dotenv";
dotenv.config();

import createError, { HttpError } from "http-errors";
import express, {
  type Request,
  type Response,
  type NextFunction,
  type Express,
} from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import helmet from "helmet";
import cors from "cors";

import indexRouter from "./routes/index";
import apiRouter from "./routes/api";
import "./lib/db";
import { createIndices } from "./lib/elasticsearch";

createIndices();

const app: Express = express();

// Trust the first proxy hop (Nginx, load balancer, etc.) for correct IP-based rate limiting
app.set("trust proxy", 1);

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

app.use(helmet());

const ALLOWED_ORIGINS = [
  process.env.SITE_URL ?? "http://localhost:5173",
  "http://localhost:5173",
  "capacitor://localhost",
  "http://localhost",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(createError(403, "Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  }),
);

app.use(logger(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Health check is unauthenticated — mount before validateApiKey
app.use("/", indexRouter);

app.use(validateApiKey);
app.use("/api/v1", apiRouter);

app.use((req: Request, res: Response, next: NextFunction) => {
  next(createError(404));
});

app.use((err: HttpError, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(JSON.stringify({ status, message: err.message, stack: err.stack }));
  }
  res.status(status).json({ error: err.message });
});

export default app;
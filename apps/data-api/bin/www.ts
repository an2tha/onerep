#!/usr/bin/env node

import app from "../app";
import mongoose from "mongoose";
import { esClient } from "../lib/elasticsearch";
import debug from "debug";
import http from "http";

const debugLog = debug("data-api:server");

const port = normalizePort(process.env.PORT || "3000");
app.set("port", port);

const server = http.createServer(app);

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

function shutdown() {
  console.log("[INFO] Shutting down...");

  // Force exit if graceful shutdown stalls
  const force = setTimeout(() => {
    console.error("[ERR] Forced exit after timeout");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    try {
      await mongoose.disconnect();
      await esClient.close();
      console.log("[INFO] Clean shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("[ERR] Shutdown error:", err);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function normalizePort(val: string): number | string | false {
  const port = parseInt(val, 10);
  if (isNaN(port)) return val;
  if (port >= 0) return port;
  return false;
}

function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== "listen") throw error;

  const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening(): void {
  const addr = server.address();
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr!.port;
  console.log(`[INFO] Listening on ${bind}`);
  debugLog("Listening on " + bind);
}

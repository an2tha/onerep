#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const app = require("../app");
const debug = require("debug")("onerep-data-api:server");
const http = require("http");

const port = normalizePort(process.env.PORT || "3001");
app.set("port", port);

const server = http.createServer(app);

server.listen(port);
server.on("error", onError);
server.on("listening", () => {
  const addr = server.address();
  const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr?.port}`;
  console.log(`[INFO] OneRep Data API listening on ${bind}`);
});

/**
 * Normalize a port specification for use when binding the server.
 *
 * @param val - The input port value (commonly from an environment variable or config)
 * @returns The parsed port number if `val` represents a non-negative integer, the original `val` if it cannot be parsed (e.g., a named pipe), or `false` if the parsed number is negative
 */
function normalizePort(val: string | number): string | number | false {
  const port = parseInt(String(val), 10);
  if (isNaN(port)) return val;
  if (port >= 0) return port;
  return false;
}

/**
 * Handle errors emitted while attempting to start or bind the HTTP server.
 *
 * Logs a descriptive message and exits the process with code 1 for `EACCES`
 * (permission denied) and `EADDRINUSE` (address in use) errors; rethrows the
 * error for other situations or when the error is not from the `listen` syscall.
 *
 * @param error - The `ErrnoException` received from the server `error` event
 * @throws The original `error` when it is not a `listen` syscall error or when the error code is not specifically handled
 */
function onError(error: NodeJS.ErrnoException) {
  if (error.syscall !== "listen") throw error;
  const bind = typeof port === "string" ? `Pipe ${port}` : `Port ${port}`;
  switch (error.code) {
    case "EACCES":
      console.error(`[ERR] ${bind} requires elevated privileges`);
      process.exit(1);
    case "EADDRINUSE":
      console.error(`[ERR] ${bind} is already in use`);
      process.exit(1);
    default:
      throw error;
  }
}

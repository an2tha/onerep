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

function normalizePort(val: string | number): string | number | false {
  const port = parseInt(String(val), 10);
  if (isNaN(port)) return val;
  if (port >= 0) return port;
  return false;
}

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

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { recordingsRouter } from "./routes/recordings.js";
import { chunksRouter } from "./routes/chunks.js";
import { ensureBucket } from "./lib/minio.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: "http://localhost:3001" }));

app.get("/health", c => c.json({ status: "ok", ts: Date.now() }));

app.route("/api/recordings", recordingsRouter);
app.route("/api/chunks", chunksRouter);

// Boot
ensureBucket().then(() => {
  console.log("[server] MinIO bucket ready");
});

export default {
  port: 3000,
  fetch: app.fetch,
};

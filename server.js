import "./env.js";
import http from "http";
import https from "https";
import fs from "fs";
import app from "./src/app.js";
import { startMqttListener } from "./src/services/mqttListener.js";
import { startDbCleanupJob } from "./src/services/cleanupJob.js";

const PORT = process.env.PORT || 5001;

/* ==========================================
   SERVER CONFIGURATION

   LOCAL:
   const USE_HTTPS = true;

   RENDER / NGINX:
   const USE_HTTPS = false;
========================================== */

const USE_HTTPS = true;

let server;

if (USE_HTTPS) {
  console.log("Starting server in HTTPS mode (certs found)");
  const sslOptions = {
    key: fs.readFileSync("./cert/server.key"),
    cert: fs.readFileSync("./cert/server.crt"),
  };
  server = https.createServer(sslOptions, app);
} else {
  console.log("Starting server in HTTP mode");
  server = http.createServer(app);
}

// Start the background MQTT telemetry logger
startMqttListener();

// Start the daily auto-cleanup cron job (keeps rolling 60-day window)
startDbCleanupJob();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`${USE_HTTPS ? "HTTPS" : "HTTP"} Server running on port ${PORT}`);
});

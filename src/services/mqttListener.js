import mqtt from "mqtt";
import prisma from "../../config/dbConfig.js";

const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://broker.hivemq.com:1883";
const SNAPSHOT_INTERVAL_MS = (parseInt(process.env.DB_SNAPSHOT_INTERVAL_MINUTES, 10) || 3) * 60 * 1000;

// In-memory buffer storing the latest telemetry per device
// Key: "floor/meter", Value: { floor, meter, current, power, relayOn, updatedAt }
const latestReadings = new Map();

export function startMqttListener() {
  console.log(`[MQTT Service] Connecting to broker at ${BROKER_URL}...`);
  const client = mqtt.connect(BROKER_URL);

  client.on("connect", () => {
    console.log("[MQTT Service] Connected successfully to MQTT Broker.");
    // Subscribe to all 3 floors (1/1 to 3/30)
    client.subscribe(["1/+", "2/+", "3/+"], (err) => {
      if (err) {
        console.error("[MQTT Service] Subscription error:", err.message);
      } else {
        console.log("[MQTT Service] Subscribed to topics: 1/+, 2/+, 3/+");
      }
    });
  });

  client.on("error", (err) => {
    console.error("[MQTT Service] Client error:", err.message);
  });

  client.on("reconnect", () => {
    console.log("[MQTT Service] Reconnecting...");
  });

  client.on("message", (topic, message) => {
    // Ignore control topics (e.g. 1/1c)
    if (topic.endsWith("c")) return;

    try {
      const payload = JSON.parse(message.toString());
      const [floorStr, meterStr] = topic.split("/");
      const floor = parseInt(floorStr, 10);
      const meter = parseInt(meterStr, 10);

      if (floor >= 1 && floor <= 3 && meter >= 1 && meter <= 30) {
        latestReadings.set(topic, {
          floor,
          meter,
          current: Number(payload.current) || 0,
          power: Number(payload.power) || 0,
          relayOn:
            payload.relayOn === true ||
            String(payload.relayOn).toUpperCase() === "ON" ||
            String(payload.relayOn) === "true",
          updatedAt: new Date(),
        });
      }
    } catch {
      // Ignore malformed JSON
    }
  });

  // Flush buffer to Neon Postgres at configurable interval (default: 3 minutes)
  // This keeps database storage compact within the Neon free tier.
  setInterval(async () => {
    if (latestReadings.size === 0) return;

    const entriesToSave = Array.from(latestReadings.values());

    try {
      await prisma.meterReading.createMany({
        data: entriesToSave.map((entry) => ({
          floor: entry.floor,
          meter: entry.meter,
          current: entry.current,
          power: entry.power,
          relayOn: entry.relayOn,
          recordedAt: entry.updatedAt,
        })),
      });

      console.log(
        `[MQTT Service] Saved snapshot of ${entriesToSave.length} device(s) to Neon Postgres at ${new Date().toLocaleTimeString()}`
      );
    } catch (dbErr) {
      console.error("[MQTT Service] Failed to save readings to DB:", dbErr.message);
    }
  }, SNAPSHOT_INTERVAL_MS);

  return client;
}


import prisma from "../../config/dbConfig.js";

/**
 * GET /api/meters/:floor/:meter/history?from=YYYY-MM-DD&to=YYYY-MM-DD&days=N
 * Calculates total energy consumed (kWh) and returns readings for a specific device.
 */
export async function getDeviceHistory(req, res) {
  try {
    const floor = parseInt(req.params.floor, 10);
    const meter = parseInt(req.params.meter, 10);
    const { from, to, days } = req.query;

    if (isNaN(floor) || isNaN(meter) || floor < 1 || floor > 3 || meter < 1 || meter > 30) {
      return res.status(400).json({ error: "Invalid floor or meter identifier." });
    }

    let startDate;
    let endDate = new Date();

    if (from) {
      startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);

      if (to) {
        endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
      }

      // auto‑swap if reversed
      if (startDate > endDate) {
        const temp = startDate;
        startDate = new Date(to);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(temp);
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      const daysCount = parseInt(days, 10) || 1;
      startDate = new Date();
      startDate.setDate(startDate.getDate() - daysCount);
    }

    // Fetch ordered historical readings for this meter
    const readings = await prisma.meterReading.findMany({
      where: {
        floor,
        meter,
        recordedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        recordedAt: "asc",
      },
      select: {
        id: true,
        current: true,
        power: true,
        relayOn: true,
        recordedAt: true,
      },
    });

    if (readings.length === 0) {
      return res.json({
        floor,
        meter,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalKWh: 0.0,
        readingsCount: 0,
        readings: [],
      });
    }

    // Integrate power (Watts) over time to calculate total kWh (Trapezoidal Rule)
    // Energy (Wh) = avgPower * (timeDiff in hours)
    let totalWattHours = 0;

    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];

      const timeDiffHours = (new Date(curr.recordedAt) - new Date(prev.recordedAt)) / (1000 * 60 * 60);

      // Only integrate if gap between successive records is <= 10 minutes (avoids counting offline periods)
      if (timeDiffHours > 0 && timeDiffHours <= 10 / 60) {
        const avgPowerWatts = (prev.power + curr.power) / 2;
        totalWattHours += avgPowerWatts * timeDiffHours;
      }
    }

    const totalKWh = totalWattHours / 1000;

    // Convert BigInt id to string for JSON serialization
    const serializedReadings = readings.map((r) => ({
      ...r,
      id: r.id.toString(),
    }));

    return res.json({
      floor,
      meter,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalKWh: Number(totalKWh.toFixed(4)),
      readingsCount: readings.length,
      readings: serializedReadings,
    });
  } catch (error) {
    console.error("Error in getDeviceHistory:", error);
    return res.status(500).json({ error: "Failed to fetch device history." });
  }
}

/**
 * GET /api/meters/summary
 * Returns overall latest metrics across all floors and devices.
 */
export async function getMetersSummary(req, res) {
  try {
    const latest = await prisma.meterReading.findMany({
      distinct: ["floor", "meter"],
      orderBy: [
        { floor: "asc" },
        { meter: "asc" },
        { recordedAt: "desc" },
      ],
    });

    const serialized = latest.map((r) => ({
      ...r,
      id: r.id.toString(),
    }));

    return res.json({ totalTracked: serialized.length, devices: serialized });
  } catch (error) {
    console.error("Error in getMetersSummary:", error);
    return res.status(500).json({ error: "Failed to fetch meters summary." });
  }
}

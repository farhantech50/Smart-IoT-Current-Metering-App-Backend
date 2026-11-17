import prisma from "../../config/dbConfig.js";

/**
 * GET /api/meters/:floor/:meter/history
 * Query params: from, to, days, page (default 1), limit (default 10, max 100)
 *
 * - totalKWh is calculated from ALL readings in the date range (not just the page)
 * - readings returned are paginated
 */
export async function getDeviceHistory(req, res) {
  try {
    const floor = parseInt(req.params.floor, 10);
    const meter = parseInt(req.params.meter, 10);
    const { from, to, days } = req.query;

    if (isNaN(floor) || isNaN(meter) || floor < 1 || floor > 3 || meter < 1 || meter > 30) {
      return res.status(400).json({ error: "Invalid floor or meter identifier." });
    }

    // --- Parse date range ---
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

    // --- Pagination params ---
    const page  = Math.max(parseInt(req.query.page)  || 1,  1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip  = (page - 1) * limit;

    const whereClause = {
      floor,
      meter,
      recordedAt: { gte: startDate, lte: endDate },
    };

    const selectClause = {
      id: true,
      current: true,
      power: true,
      relayOn: true,
      recordedAt: true,
    };

    // Run total count + paginated page + full power list (for kWh) in parallel
    const [totalCount, pageReadings, allForKwh] = await Promise.all([
      prisma.meterReading.count({ where: whereClause }),
      prisma.meterReading.findMany({
        where: whereClause,
        orderBy: { recordedAt: "desc" }, // newest first for the table
        skip,
        take: limit,
        select: selectClause,
      }),
      prisma.meterReading.findMany({
        where: whereClause,
        orderBy: { recordedAt: "asc" },
        select: { power: true, recordedAt: true },
      }),
    ]);

    // --- Trapezoidal integration for total kWh ---
    let totalWattHours = 0;
    for (let i = 1; i < allForKwh.length; i++) {
      const prev = allForKwh[i - 1];
      const curr = allForKwh[i];
      const timeDiffHours =
        (new Date(curr.recordedAt) - new Date(prev.recordedAt)) / (1000 * 60 * 60);
      // skip gaps > 10 min (device was offline)
      if (timeDiffHours > 0 && timeDiffHours <= 10 / 60) {
        totalWattHours += ((prev.power + curr.power) / 2) * timeDiffHours;
      }
    }
    const totalKWh = totalWattHours / 1000;

    // Serialize BigInt IDs
    const readings = pageReadings.map((r) => ({ ...r, id: r.id.toString() }));

    return res.json({
      floor,
      meter,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalKWh: Number(totalKWh.toFixed(4)),
      readingsCount: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      readings,
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

    const serialized = latest.map((r) => ({ ...r, id: r.id.toString() }));
    return res.json({ totalTracked: serialized.length, devices: serialized });
  } catch (error) {
    console.error("Error in getMetersSummary:", error);
    return res.status(500).json({ error: "Failed to fetch meters summary." });
  }
}

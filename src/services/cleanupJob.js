import cron from "node-cron";
import prisma from "../../config/dbConfig.js";

const RETENTION_DAYS = parseInt(process.env.DB_RETENTION_DAYS, 10) || 45;

/**
 * Starts a daily cleanup job at midnight (00:00:00).
 * Deletes meter readings older than DB_RETENTION_DAYS (default: 45 days) to keep
 * Neon Postgres storage comfortably below the 500 MB free tier limit.
 */
export function startDbCleanupJob() {
  console.log(`[Cleanup Service] Database retention auto-cleanup job scheduled for 00:00 daily (${RETENTION_DAYS}-day window).`);

  // Schedule to run every day at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

      const result = await prisma.meterReading.deleteMany({
        where: {
          recordedAt: {
            lt: cutoffDate,
          },
        },
      });

      console.log(
        `[Cleanup Service] Auto-cleanup completed at ${new Date().toISOString()}. Deleted ${result.count} records older than ${RETENTION_DAYS} days.`
      );
    } catch (err) {
      console.error("[Cleanup Service] Error during database cleanup:", err.message);
    }
  });
}


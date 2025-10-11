import cron from "node-cron";
import "dotenv/config";
import { dbClient } from "@db/client";
import { item } from "@db/schema";
import { sql } from "drizzle-orm";

const DEFAULT_DAYS = 7;

/**
 * cleanup and set isActive = false for items older than `days`.
 * @param days number of days (must be >= 0)
 */
export async function runCleanup(days?: number) {
  const d = typeof days === "number" && days >= 0 ? Math.floor(days) : parseInt(process.env.ITEM_INACTIVE_DAYS || "" , 10);
  const daysToUse = Number.isFinite(d) && d >= 0 ? d : DEFAULT_DAYS;

  // Use interval on DB side
  const updateQuery = dbClient
    .update(item)
    .set({ isActive: false })
    .where(sql`${item.createdAt} <= (CURRENT_TIMESTAMP - INTERVAL ${sql`${daysToUse}`} DAY)`);

  try {
    const res = await updateQuery;
    console.log(`cleanupItems: set isActive=false for items older than ${daysToUse} days. result:`, res);
    return res;
  } catch (e) {
    console.error("cleanupItems: update failed:", e);
    throw e;
  }
}

/**
 * Schedule the cleanup to run daily at 00:00 server time.
 * Optionally pass `days` to override the env var.
 */
export function scheduleDailyCleanup(days?: number) {
  runCleanup(days).catch((e) => console.error("cleanupItems immediate run failed:", e));
  
  cron.schedule("0 0 * * *", () => {
    runCleanup(days).catch((e) => console.error("cleanupItems scheduled run failed:", e));
  });
}

export default scheduleDailyCleanup;

// src/jobs/item-expire.queue.ts
import { Queue, Worker } from "bullmq";
import { bullConnection } from "../lib/redis";
import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { and, eq, lte } from "drizzle-orm";

type ItemExpireJob = { itemId: string };

const QUEUE = "item-expire";

const toDelay = (runAt: Date | string | number) =>
  Math.max(0, new Date(runAt).getTime() - Date.now());

const jobId = (itemId: string) => `item:${itemId}:expire`;

export const itemExpireQueue = new Queue<ItemExpireJob>(QUEUE, {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 1000,
    attempts: 1,
  },
});

export async function scheduleItemExpire(
  itemId: string,
  runAt: Date | string | number
) {
  await itemExpireQueue.add(
    "expire",
    { itemId },
    { delay: toDelay(runAt), jobId: jobId(itemId) }
  );
}

export async function cancelItemExpire(itemId: string) {
  const j = await itemExpireQueue.getJob(jobId(itemId));
  if (!j) return;
  try {
    const state = await j.getState();
    if (state !== "active") await j.remove();
  } catch {
    // เงียบ ๆ ถ้าถูก worker จับอยู่ ปล่อยให้จบเอง
  }
}

export function startItemExpireWorker() {
  const worker = new Worker<ItemExpireJob>(
    QUEUE,
    async (job) => {
      const { itemId } = job.data;
      const now = new Date();

      // Idempotent: หมดอายุได้เฉพาะ item ที่ยังขายอยู่จริง ๆ เท่านั้น
      const res = await dbClient
        .update(schema.item)
        .set({
          isActive: false,
          status: 0, // 0 = expired/hidden (กำหนดตามระบบคุณ)
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.item.id, itemId),
            eq(schema.item.isActive, true),
            eq(schema.item.status, 1), // 1 = AVAILABLE เท่านั้นถึง expire
            lte(schema.item.expiresAt, now) // ถึงเวลาแล้วจริง ๆ
          )
        );

      // ถ้าจะ broadcast SSE ไปหน้า marketplace ก็ใส่ตรงนี้ได้
      // sseHub.publish(`item:${itemId}`, "item.expired", { itemId });
    },
    { connection: bullConnection, concurrency: 4 }
  );

  worker.on("failed", (job, err) => {
    console.error("[jobs] item-expire failed:", job?.id, err);
  });

  const close = async () => worker.close();
  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  return worker;
}

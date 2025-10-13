import { Queue, QueueEvents, JobsOptions, Worker } from "bullmq";
import { bullConnection } from "../lib/redis";
import { ordersService } from "../order/orders.service"; // path ของคุณ
import { sseHub } from "../lib/sse"; // path ของคุณ

export type ExpireJob = {
  orderId: string;
  kind: "hold" | "trade"; // hold = ยังไม่ accept, trade = ระหว่างเทรด
};

const QUEUE_NAME = "order-expire";

export const orderExpireQueue = new Queue<ExpireJob>(QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 1000,
    attempts: 1, // งานหมดอายุไม่ควร retry
  },
});

export const orderExpireEvents = new QueueEvents(QUEUE_NAME, {
  connection: bullConnection,
});

// -------- helpers --------
const toDelay = (runAt: Date | string | number) =>
  Math.max(0, new Date(runAt).getTime() - Date.now());

const jobIdHold = (orderId: string) => `order:${orderId}:hold`;
const jobIdTrade = (orderId: string) => `order:${orderId}:trade`;

export async function scheduleHoldExpire(
  orderId: string,
  runAt: Date | string | number
) {
  await orderExpireQueue.add(
    "expire",
    { orderId, kind: "hold" },
    { delay: toDelay(runAt), jobId: jobIdHold(orderId) }
  );
}

export async function scheduleTradeExpire(
  orderId: string,
  runAt: Date | string | number
) {
  await orderExpireQueue.add(
    "expire",
    { orderId, kind: "trade" },
    { delay: toDelay(runAt), jobId: jobIdTrade(orderId) }
  );
}

export async function cancelAllExpireJobs(orderId: string) {
  const ids = [jobIdHold(orderId), jobIdTrade(orderId)];
  for (const id of ids) {
    const j = await orderExpireQueue.getJob(id);
    if (!j) continue;
    try {
      const state = await j.getState(); // 'delayed' | 'waiting' | 'active' | ...
      if (state === "active") {
        // ปล่อยให้ worker จบงานเอง ห้าม remove ตอนกำลังรัน
        continue;
      }
      await j.remove();
    } catch (err: any) {
      if (String(err?.message).includes("locked by another worker")) {
        // แค่ log เบาๆ แล้วข้ามไป
        console.info(`[jobs] skip remove locked job ${id}`);
      } else {
        console.warn(`[jobs] remove job ${id} failed:`, err);
      }
    }
  }
}

// -------- worker starter (เรียกตอนบูต) --------
export function startOrderExpireWorker() {
  const worker = new Worker<ExpireJob>(
    QUEUE_NAME,
    async (job) => {
      const { orderId, kind } = job.data;
      // ให้ service ทำแบบ idempotent + transaction ภายใน
      const result = await ordersService.expireIfDue({
        orderId,
        reason: kind === "hold" ? "SELLER_TIMEOUT" : "TRADE_TIMEOUT",
      });

      if (result?.changed) {
        // แจ้ง SSE
        sseHub.publish(`order:${orderId}`, "order.update", {
          orderId,
          action: "expired",
          reason: job.data.kind,
        });
        // แจ้ง user channel เผื่อกระดิก badge
        if (result.buyerId) {
          sseHub.publish(`user:${result.buyerId}`, "order.update", {
            orderId,
            action: "expired",
          });
        }
        if (result.sellerId) {
          sseHub.publish(`user:${result.sellerId}`, "order.update", {
            orderId,
            action: "expired",
          });
        }
      }
    },
    { connection: bullConnection, concurrency: 4 }
  );

  worker.on("failed", (job, err) => {
    console.error("[jobs] order-expire failed:", job?.id, err);
  });
  worker.on("completed", (job) => {
    // console.log("[jobs] order-expire completed:", job?.id);
  });

  const close = async () => {
    await worker.close();
    await orderExpireEvents.close();
  };

  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  return worker;
}
